#include <WiFi.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <esp_timer.h>
#include <soc/gpio_reg.h>

// ============================================================
// CONFIGURAÇÕES / MEMÓRIA
// ============================================================

Preferences prefs;

String cativeiroId;
String savedSSID;
String savedPassword;
String apiBaseUrl;

// Chave do dispositivo gerada no painel (botão "Chave" do cativeiro).
// Depois que o cativeiro tem chave, a API recusa as chamadas sem ela.
String deviceKey;

// Horário de Brasília (UTC-3). O timeClient já devolve a hora local:
// getEpochTime() é UTC + FUSO_SEGUNDOS, não UTC.
const long FUSO_SEGUNDOS = -10800;

WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", FUSO_SEGUNDOS);

bool ntpSincronizado = false;

// Horário UTC (segundos desde 1970), que é o que a API espera em "ts".
uint32_t epochUTC()
{
    return (uint32_t)(timeClient.getEpochTime() - FUSO_SEGUNDOS);
}

// ============================================================
// CONEXÃO
// ============================================================

// A API respondeu na última tentativa? Sem resposta, a placa para de
// consultar calibração e dieta, guarda as leituras na fila e só testa
// a conexão a cada 30 s (cada tentativa sem internet trava o loop até
// o tempo limite do HTTP).
bool apiOnline = true;
unsigned long ultimaSondagem = 0;
const unsigned long intervaloSondagemOffline = 30000UL;

// Reconexão do Wi-Fi sem travar o loop: pede a conexão e segue; se não
// conectar, pede de novo depois de 10 s, 20 s, 40 s... até 60 s.
unsigned long ultimaTentativaWiFi = 0;
unsigned long intervaloTentativaWiFi = 10000UL;
const unsigned long INTERVALO_WIFI_MAX = 60000UL;

// ============================================================
// FILA DE LEITURAS SEM INTERNET
// ============================================================

// Sem internet, as leituras de cada minuto viram uma média, guardada
// num arquivo (LittleFS). Ao reconectar, a placa envia a fila em lotes
// para POST /parametros/lote, cada leitura com o horário em que foi
// medida. Um registro tem 10 bytes: 1 dia sem internet ~ 14 KB.
struct __attribute__((packed)) RegistroLeitura
{
    uint32_t ts;      // UTC, segundos (primeira leitura do minuto)
    int16_t temp;     // °C x 100
    uint16_t ph;      // pH x 100
    uint16_t amonia;  // ppm x 100
};

const char *ARQUIVO_FILA = "/fila_leituras.bin";
const char *ARQUIVO_FILA_TMP = "/fila_leituras.tmp";

// A API aceita até 30 dias de atraso: 30 x 1440 minutos.
const uint32_t MAX_PENDENTES_FILA = 43200;
// Registros já enviados continuam no começo do arquivo até a fila
// esvaziar; se o arquivo passar disto, é reescrito só com os pendentes.
const uint32_t MAX_REGISTROS_ARQUIVO = 60000;
// Leituras por lote (1 hora de médias). A API aceita até 100.
const int LEITURAS_POR_LOTE = 60;

bool filaDisponivel = false;
// Quantos registros do início do arquivo já foram enviados (NVS).
uint32_t filaEnviados = 0;
uint32_t filaTotal = 0;

unsigned long ultimoEnvioLote = 0;
unsigned long intervaloEnvioLote = 0;
const unsigned long INTERVALO_LOTE_OK = 1000UL;
const unsigned long INTERVALO_LOTE_FALHA = 30000UL;

// Média do minuto em andamento (só leituras que não foram enviadas).
uint32_t acumMinuto = 0;
uint32_t acumPrimeiroTs = 0;
int acumQuantidade = 0;
double acumTemp = 0;
double acumPh = 0;
double acumAmonia = 0;

// ============================================================
// PINOS
// ============================================================

// PH-4502C
const int pHPin = 35;

// Sensor de gases
const int amoniaPin = 34;

// DS18B20
const int tempPin = 32;

// 28BYJ-48 + ULN2003
const int motorIN1 = 25;
const int motorIN2 = 26;
const int motorIN3 = 27;
const int motorIN4 = 14;

OneWire oneWire(tempPin);
DallasTemperature sensors(&oneWire);

// ============================================================
// DIETA
// ============================================================

String horariosAlimentacao[20];
int quantidadeHorarios = 0;

float racaoDesejada = 25.0;

// Valor calibrado: gramas liberadas por uma rotação do eixo.
float gramasPorRotacao = 0.0;

// Horários já servidos hoje. Ficam também na memória (NVS) para
// que a placa, ao reiniciar, não sirva de novo o mesmo horário.
String alimentacoesRealizadas[20];
int totalAlimentacoesRealizadas = 0;

// Se a placa perder o minuto exato (sem rede, reiniciando,
// calibrando, motor ocupado), ainda serve a refeição até
// este tanto de minutos depois do horário.
const int JANELA_ATRASO_MIN = 15;

// Depois de uma alimentação que não pôde começar (ex.: motor
// sem calibração), espera este tempo antes de tentar de novo.
unsigned long ultimaFalhaAlimentacao = 0;
const unsigned long intervaloRetentativaAlimentacao = 60000UL;

// Por que a última alimentação não pôde começar (vai para a API).
String motivoFalhaAlimentacao = "";

// Avisos de alimentação para a API (POST /alimentacoes). Ficam numa
// fila, também guardada na memória (NVS), e são enviados em ordem
// quando o motor para. Se a internet cair, a placa continua
// alimentando e acumulando os avisos; ao voltar, envia todos, com a
// data e o horário de cada refeição. Sem rede, tenta de novo a cada 30 s.
struct RelatorioAlimentacao
{
    String data;
    String horario;
    String status;
    String motivo;
    float gramas;
    float rotacoes;
    int atraso;
};

// 32 avisos cobrem vários dias sem internet numa dieta comum (3 a 6
// horários por dia). Cheia, descarta o aviso mais antigo. O limite
// também mantém a fila dentro do tamanho de texto aceito pelo NVS.
const int MAX_FILA_RELATORIOS = 32;
const int MAX_BYTES_FILA_NVS = 3800;
RelatorioAlimentacao filaRelatorios[MAX_FILA_RELATORIOS];
int totalFilaRelatorios = 0;

unsigned long ultimoEnvioRelatorio = 0;
const unsigned long intervaloEnvioRelatorio = 30000UL;

// Falha já avisada (data + horário), para avisar uma vez só.
String falhaAvisada = "";

String dataControle = "";
String dataHoje = "";
String dataHoraISO = "";

// ============================================================
// TIMERS
// ============================================================

unsigned long ultimoFetchDieta = 0;
const unsigned long intervaloFetchDieta = 60000UL;

unsigned long ultimoEnvioDados = 0;
const unsigned long intervaloEnvioDados = 5000UL;

unsigned long ultimoFetchCalibracao = 0;
const unsigned long intervaloCalibracao = 3000UL;

unsigned long ultimaTentativaNTP = 0;
const unsigned long intervaloTentativaNTP = 10000UL;

unsigned long ultimoLogMotor = 0;
const unsigned long intervaloLogMotor = 5000UL;

// ============================================================
// MOTOR 28BYJ-48
// ============================================================

// Half-step: 4096 passos aproximadamente = 1 volta do eixo de saída.
// A relação real do motor pode variar; para o cálculo de alimentação,
// a calibração em gramas/rotação é o que determina a quantidade final.
const long PASSOS_POR_ROTACAO = 4096;

// Intervalo entre passos.
// Aumente se o motor perder passos.
const unsigned long INTERVALO_PASSO_US = 2000;

// Os passos são dados por um timer do ESP32 (esp_timer), e não pelo
// loop(). Assim o motor continua girando enquanto o loop() espera a
// rede (HTTP lento em roteador de celular, reconexão do Wi-Fi etc.).
esp_timer_handle_t timerMotor = nullptr;

// Protege as variáveis do motor, que são alteradas pelo timer e
// lidas pelo loop() ao mesmo tempo.
portMUX_TYPE muxMotor = portMUX_INITIALIZER_UNLOCKED;

const byte sequenciaMotor[8][4] = {
    {1, 0, 0, 0},
    {1, 1, 0, 0},
    {0, 1, 0, 0},
    {0, 1, 1, 0},
    {0, 0, 1, 0},
    {0, 0, 1, 1},
    {0, 0, 0, 1},
    {1, 0, 0, 1}
};

volatile int passoAtual = 0;

volatile bool motorAtivo = false;
volatile long passosRestantes = 0;
volatile long passosMotorExecutados = 0;

volatile int direcaoMotor = 1;

// O timer avisa que o motor terminou; o loop() imprime a mensagem
// (o timer não pode usar Serial).
volatile bool motorFinalizouAviso = false;

// ============================================================
// CALIBRAÇÃO
// ============================================================

bool calibracaoAtiva = false;

String calibracaoTipo = "";
String calibracaoEtapa = "";

int calibracaoRotacoes = 0;

// Evita repetir uma mesma medição de pH enquanto a API
// ainda estiver processando a anterior.
bool phMedicaoEnviada = false;

// Evita enviar o resultado do motor várias vezes.
bool motorResultadoEnviado = false;
bool motorCalibracaoIniciada = false;

// Se o envio da conclusão do motor falhar, espera antes de
// tentar de novo (sem isso a placa repete o POST sem parar).
unsigned long ultimaTentativaResultadoMotor = 0;
const unsigned long intervaloTentativaResultado = 5000UL;

// ============================================================
// PH-4502C
// ============================================================

float tensaoPH7 = 0.0;
float tensaoPH4 = 0.0;

bool possuiCalibracaoPH = false;

// ============================================================
// PROTÓTIPOS
// ============================================================

void desligarMotor();
void iniciarMotorPassos(long passos, int direcao);
void processarMotor(void *arg);
void criarTimerMotor();

float lerTensaoPH();
float lerPH();

float lerAmonia();

void buscarDietaDaAPI();
void buscarCalibracaoDaAPI();

int enviarParametrosParaAPI(
    float temp,
    float ph,
    float amonia,
    const String &idCativeiro,
    const String &dataHoraISO);

bool enviarResultadoCalibracao(
    const String &etapa,
    float valor,
    int rotacoes);

void cancelarCalibracaoLocal();

void fetchDeDados(
    int currentHour,
    int currentMinute);

bool jaAlimentouHorario(String horarioAtual);
void registrarAlimentacao(String horarioAtual);

bool iniciarAlimentacao(float gramas);
void salvarAlimentacoesDoDia();
void agendarRelatorioAlimentacao(const String &horario, const String &status, int atraso);
int enviarRelatorioAlimentacao(const RelatorioAlimentacao &r);
void salvarFilaRelatorios();
void carregarFilaRelatorios();
void carregarAlimentacoesDoDia();

void reconectarWiFi();
bool redePronta();
void anotarRespostaHttp(int code);

void iniciarFilaLeituras();
void acumularLeituraOffline(float temp, float ph, float amonia);
void fecharMinutoOffline(bool forcar);
void gravarRegistroFila(const RegistroLeitura &r);
int enviarLoteDaFila();

void mostrarConfiguracoes();

// ============================================================
// CHAVE DO DISPOSITIVO
// ============================================================

void adicionarChave(HTTPClient &http)
{
    if (!deviceKey.isEmpty())
        http.addHeader("X-Device-Key", deviceKey);
}

// ============================================================
// MOTOR
// ============================================================

// Os 4 pinos do motor estão abaixo do GPIO 32, então dá para
// ligar/desligar todos de uma vez escrevendo direto nos
// registradores (rápido e seguro dentro do timer).
const uint32_t MASCARA_PINOS_MOTOR =
    (1UL << motorIN1) |
    (1UL << motorIN2) |
    (1UL << motorIN3) |
    (1UL << motorIN4);

// Chamar com muxMotor travado.
void aplicarPasso(int indice)
{
    uint32_t ligar = 0;

    if (sequenciaMotor[indice][0]) ligar |= (1UL << motorIN1);
    if (sequenciaMotor[indice][1]) ligar |= (1UL << motorIN2);
    if (sequenciaMotor[indice][2]) ligar |= (1UL << motorIN3);
    if (sequenciaMotor[indice][3]) ligar |= (1UL << motorIN4);

    REG_WRITE(GPIO_OUT_W1TC_REG, MASCARA_PINOS_MOTOR & ~ligar);
    REG_WRITE(GPIO_OUT_W1TS_REG, ligar);
}

// Chamar com muxMotor travado.
void desligarBobinas()
{
    REG_WRITE(GPIO_OUT_W1TC_REG, MASCARA_PINOS_MOTOR);
}

void criarTimerMotor()
{
    if (timerMotor != nullptr)
        return;

    esp_timer_create_args_t args = {};
    args.callback = &processarMotor;
    args.name = "motor";

    if (esp_timer_create(&args, &timerMotor) != ESP_OK)
    {
        timerMotor = nullptr;
        Serial.println("ERRO: nao foi possivel criar o timer do motor.");
    }
}

void desligarMotor()
{
    if (timerMotor != nullptr)
        esp_timer_stop(timerMotor);

    // Mesmo que o timer esteja no meio de um passo no outro núcleo,
    // a trava garante que as bobinas terminam desligadas.
    portENTER_CRITICAL(&muxMotor);
    motorAtivo = false;
    passosRestantes = 0;
    desligarBobinas();
    portEXIT_CRITICAL(&muxMotor);
}

void iniciarMotorPassos(long passos, int direcao)
{
    if (passos <= 0)
    {
        Serial.println("ERRO: quantidade de passos inválida.");
        return;
    }

    if (motorAtivo)
    {
        Serial.println("AVISO: motor já está em movimento.");
        return;
    }

    criarTimerMotor();

    if (timerMotor == nullptr)
        return;

    // Se o timer ainda estiver de pé por algum motivo, para antes.
    esp_timer_stop(timerMotor);

    portENTER_CRITICAL(&muxMotor);
    passosRestantes = passos;
    passosMotorExecutados = 0;
    direcaoMotor = (direcao >= 0) ? 1 : -1;
    motorFinalizouAviso = false;
    motorAtivo = true;
    portEXIT_CRITICAL(&muxMotor);

    if (esp_timer_start_periodic(timerMotor, INTERVALO_PASSO_US) != ESP_OK)
    {
        Serial.println("ERRO: nao foi possivel iniciar o timer do motor.");
        desligarMotor();
        return;
    }

    Serial.printf(
        "Motor iniciado: %ld passos | direção: %d\n",
        passos,
        (int)direcaoMotor);
}

// Chamado pelo timer a cada INTERVALO_PASSO_US: dá um passo.
// Não pode usar Serial, HTTP nem delay aqui dentro.
void processarMotor(void *arg)
{
    bool terminou = false;

    portENTER_CRITICAL(&muxMotor);

    if (motorAtivo)
    {
        passoAtual = (passoAtual + direcaoMotor + 8) % 8;

        aplicarPasso(passoAtual);

        passosRestantes--;
        passosMotorExecutados++;

        if (passosRestantes <= 0)
        {
            passosRestantes = 0;
            motorAtivo = false;
            motorFinalizouAviso = true;
            desligarBobinas();
            terminou = true;
        }
    }
    else
    {
        // Cancelado entre um passo e outro.
        terminou = true;
    }

    portEXIT_CRITICAL(&muxMotor);

    if (terminou)
        esp_timer_stop(timerMotor);
}

// ============================================================
// SENSOR DE PH
// ============================================================

float lerTensaoPH()
{
    const int quantidadeLeituras = 30;

    long soma = 0;

    for (int i = 0; i < quantidadeLeituras; i++)
    {
        soma += analogRead(pHPin);
        delay(5);
    }

    float media = soma / (float)quantidadeLeituras;

    float voltage =
        (media / 4095.0) * 3.3;

    return voltage;
}

float lerPH()
{
    float voltage = lerTensaoPH();

    if (!possuiCalibracaoPH)
    {
        // Mantém a leitura aproximada enquanto o sensor
        // ainda não possui os dois pontos de calibração.
        float ph =
            7.0 + ((2.5 - voltage) / 0.18);

        return ph;
    }

    if (abs(tensaoPH4 - tensaoPH7) < 0.001)
    {
        Serial.println("ERRO: pontos de calibração do pH muito próximos.");
        return -1.0;
    }

    // Reta que passa pelos pontos:
    //
    // tensãoPH7 -> pH 7
    // tensãoPH4 -> pH 4

    float coefAngular =
        (4.0 - 7.0) /
        (tensaoPH4 - tensaoPH7);

    float coefLinear =
        7.0 -
        (coefAngular * tensaoPH7);

    float ph =
        (coefAngular * voltage) +
        coefLinear;

    return ph;
}

// ============================================================
// SENSOR DE AMÔNIA
// ============================================================

float lerAmonia()
{
    long soma = 0;

    for (int i = 0; i < 10; i++)
    {
        soma += analogRead(amoniaPin);
        delay(10);
    }

    float voltage =
        ((soma / 10.0) / 4095.0) * 3.3;

    // Mantido conforme o comportamento do código original.
    float ppm = voltage;

    return ppm;
}

// ============================================================
// WIFI
// ============================================================

// Não espera a conexão: só pede ao Wi-Fi para reconectar e volta. Antes
// a placa ficava até 15 s parada aqui, várias vezes por volta do loop.
void reconectarWiFi()
{
    if (WiFi.status() == WL_CONNECTED)
    {
        intervaloTentativaWiFi = 10000UL;
        return;
    }

    if (savedSSID.isEmpty())
        return;

    unsigned long agora = millis();

    if (ultimaTentativaWiFi != 0 &&
        agora - ultimaTentativaWiFi < intervaloTentativaWiFi)
        return;

    ultimaTentativaWiFi = agora > 0 ? agora : 1;

    Serial.println("Wi-Fi desconectado: tentando reconectar...");

    WiFi.disconnect();
    WiFi.begin(savedSSID.c_str(), savedPassword.c_str());

    intervaloTentativaWiFi =
        min(intervaloTentativaWiFi * 2, INTERVALO_WIFI_MAX);
}

// Wi-Fi conectado e pronto para uma requisição.
bool redePronta()
{
    reconectarWiFi();

    if (WiFi.status() != WL_CONNECTED)
    {
        // Mesmo efeito de uma requisição sem resposta.
        anotarRespostaHttp(-1);
        return false;
    }

    return true;
}

// Código HTTP > 0: a API respondeu (mesmo que com erro).
// Negativo: sem resposta (sem internet, DNS, tempo esgotado).
void anotarRespostaHttp(int code)
{
    bool estavaOnline = apiOnline;

    apiOnline = code > 0;

    if (estavaOnline && !apiOnline)
    {
        ultimaSondagem = millis();
        Serial.println(
            "SEM CONEXAO COM A API: leituras vao para a fila.");
    }
    else if (!estavaOnline && apiOnline)
    {
        Serial.println("Conexao com a API restabelecida.");
    }
}

// ============================================================
// DIETA
// ============================================================

void buscarDietaDaAPI()
{
    if (!redePronta())
        return;

    if (cativeiroId.length() < 24)
    {
        Serial.println("cativeiroId inválido.");
        return;
    }

    HTTPClient http;

    String url =
        String(apiBaseUrl) +
        "/dietas/atual/" +
        cativeiroId;

    http.begin(url);
    http.setTimeout(8000);
    adicionarChave(http);

    int code = http.GET();
    anotarRespostaHttp(code);

    if (code == 200)
    {
        String payload = http.getString();

        StaticJsonDocument<1024> doc;

        DeserializationError err =
            deserializeJson(doc, payload);

        if (!err)
        {
            quantidadeHorarios = 0;

            if (!doc["horarios"].isNull())
            {
                JsonArray horarios =
                    doc["horarios"].as<JsonArray>();

                Serial.println(
                    "============== Dieta Buscada ==============");

                for (JsonVariant v : horarios)
                {
                    if (quantidadeHorarios < 20)
                    {
                        horariosAlimentacao[
                            quantidadeHorarios] =
                            v.as<String>();

                        Serial.print("Horário carregado: ");
                        Serial.println(
                            horariosAlimentacao[
                                quantidadeHorarios]);

                        quantidadeHorarios++;
                    }
                }
            }

            if (!doc["quantidade"].isNull())
            {
                racaoDesejada =
                    doc["quantidade"].as<float>();

                Serial.printf(
                    "Ração: %.2f g\n",
                    racaoDesejada);
            }

            if (!doc["descricao"].isNull())
            {
                Serial.printf(
                    "Dieta: %s\n",
                    doc["descricao"].as<const char *>());
            }

            // A API pode enviar a calibração junto com a dieta.
            if (!doc["gramas_por_rotacao"].isNull())
            {
                float gprAPI =
                    doc["gramas_por_rotacao"].as<float>();

                if (gprAPI > 0)
                {
                    gramasPorRotacao = gprAPI;

                    prefs.putFloat(
                        "gpr",
                        gramasPorRotacao);

                    Serial.printf(
                        "GPR recebido da API: %.4f g/rotacao\n",
                        gramasPorRotacao);
                }
            }
        }
        else
        {
            Serial.println(
                "Erro ao parsear JSON dieta: " +
                String(err.c_str()));
        }
    }
    else if (code == 404)
    {
        // Cativeiro sem dieta ativa: para de alimentar em vez de
        // continuar com os últimos horários recebidos.
        if (quantidadeHorarios > 0)
        {
            Serial.println(
                "Sem dieta ativa: alimentação programada suspensa.");
        }

        quantidadeHorarios = 0;
    }
    else
    {
        // Falha de rede ou da API: mantém a última dieta recebida.
        Serial.printf(
            "Erro HTTP dieta: %d\n",
            code);
    }

    http.end();

    Serial.println(
        "============================================\n");
}

// ============================================================
// CALIBRAÇÃO - CONSULTA À API
// ============================================================

void buscarCalibracaoDaAPI()
{
    if (!redePronta())
        return;

    if (cativeiroId.length() < 24)
        return;

    HTTPClient http;

    String url =
        String(apiBaseUrl) +
        "/calibracao/atual/" +
        cativeiroId;

    http.begin(url);
    http.setTimeout(5000);
    adicionarChave(http);

    int code = http.GET();
    anotarRespostaHttp(code);

    if (code != 200)
    {
        Serial.printf(
            "Erro HTTP calibracao: %d\n",
            code);

        http.end();
        return;
    }

    String payload = http.getString();

    StaticJsonDocument<768> doc;

    DeserializationError err =
        deserializeJson(doc, payload);

    if (err)
    {
        Serial.println(
            "Erro ao parsear calibracao: " +
            String(err.c_str()));

        http.end();
        return;
    }

    // A API pode devolver os valores salvos mesmo quando
    // a calibração já foi concluída.
    if (!doc["gramas_por_rotacao"].isNull())
    {
        float gprAPI =
            doc["gramas_por_rotacao"].as<float>();

        if (gprAPI > 0)
        {
            gramasPorRotacao = gprAPI;

            prefs.putFloat(
                "gpr",
                gramasPorRotacao);

            Serial.printf(
                "GPR sincronizado: %.4f g/rotacao\n",
                gramasPorRotacao);
        }
    }

    if (!doc["tensao_ph7"].isNull())
    {
        tensaoPH7 =
            doc["tensao_ph7"].as<float>();

        prefs.putFloat("ph7", tensaoPH7);
    }

    if (!doc["tensao_ph4"].isNull())
    {
        tensaoPH4 =
            doc["tensao_ph4"].as<float>();

        prefs.putFloat("ph4", tensaoPH4);
    }

    if (
        tensaoPH7 > 0 &&
        tensaoPH4 > 0 &&
        abs(tensaoPH4 - tensaoPH7) > 0.001)
    {
        possuiCalibracaoPH = true;

        prefs.putBool(
            "phCal",
            true);
    }

    bool ativa =
        doc["ativa"] |
        false;

    if (!ativa)
    {
        if (calibracaoAtiva)
        {
            Serial.println(
                "Calibracao encerrada pela API.");

            // Cancelada no meio da rotação: para o motor. Durante a
            // calibração não há alimentação, então o motor em
            // movimento é o da calibração.
            if (calibracaoTipo == "motor" && motorAtivo)
            {
                desligarMotor();

                Serial.println(
                    "Motor parado (calibracao cancelada).");
            }
        }

        calibracaoAtiva = false;
        calibracaoTipo = "";
        calibracaoEtapa = "";
        phMedicaoEnviada = false;
        motorResultadoEnviado = false;
        motorCalibracaoIniciada = false;
        ultimaTentativaResultadoMotor = 0;

        http.end();
        return;
    }

    String novoTipo =
        doc["tipo"] |
        "";

    String novaEtapa =
        doc["etapa"] |
        "";

    // Detecta troca de etapa antes de processar o comando.
    // Isso evita repetir uma medição de pH ou reiniciar
    // a execução do motor.
    if (
        novoTipo != calibracaoTipo ||
        novaEtapa != calibracaoEtapa)
    {
        phMedicaoEnviada = false;
        motorResultadoEnviado = false;
        motorCalibracaoIniciada = false;
        ultimaTentativaResultadoMotor = 0;
    }

    calibracaoAtiva = true;
    calibracaoTipo = novoTipo;
    calibracaoEtapa = novaEtapa;

    // --------------------------------------------------------
    // MOTOR
    // --------------------------------------------------------

    if (novoTipo == "motor")
    {
        calibracaoTipo = "motor";
        calibracaoEtapa = novaEtapa;

        int rotacoes =
            doc["rotacoes"] |
            10;

        calibracaoRotacoes = rotacoes;

        // A API pode enviar uma calibração já concluída.
        if (novaEtapa == "executar" &&
            !motorAtivo &&
            !motorCalibracaoIniciada &&
            !motorResultadoEnviado)
        {
            long passos =
                (long)rotacoes *
                PASSOS_POR_ROTACAO;

            Serial.println();
            Serial.println(
                "========== CALIBRACAO MOTOR ==========");

            Serial.printf(
                "Rotacoes solicitadas: %d\n",
                rotacoes);

            Serial.printf(
                "Passos: %ld\n",
                passos);

            iniciarMotorPassos(passos, 1);
            motorCalibracaoIniciada = true;
        }
    }

    // --------------------------------------------------------
    // PH
    // --------------------------------------------------------

    if (novoTipo == "ph")
    {
        calibracaoTipo = "ph";
        calibracaoEtapa = novaEtapa;

        // A API manda a etapa ph7 ou ph4.
        //
        // Quando o ESP32 recebe a etapa, ele mede uma vez
        // e envia a tensão para a API.

        if (novaEtapa == "ph7" &&
            !phMedicaoEnviada &&
            !motorAtivo)
        {
            Serial.println();
            Serial.println(
                "========== CALIBRACAO PH 7 ==========");

            float tensao =
                lerTensaoPH();

            Serial.printf(
                "Tensao pH7: %.4f V\n",
                tensao);

            if (enviarResultadoCalibracao(
                    "ph7",
                    tensao,
                    0))
            {
                phMedicaoEnviada = true;
            }
        }

        if (novaEtapa == "ph4" &&
            !phMedicaoEnviada &&
            !motorAtivo)
        {
            Serial.println();
            Serial.println(
                "========== CALIBRACAO PH 4 ==========");

            float tensao =
                lerTensaoPH();

            Serial.printf(
                "Tensao pH4: %.4f V\n",
                tensao);

            if (enviarResultadoCalibracao(
                    "ph4",
                    tensao,
                    0))
            {
                phMedicaoEnviada = true;
            }
        }
    }

    http.end();
}

// ============================================================
// ENVIA RESULTADO DA CALIBRAÇÃO
// ============================================================

bool enviarResultadoCalibracao(
    const String &etapa,
    float valor,
    int rotacoes)
{
    if (!redePronta())
        return false;

    if (cativeiroId.length() < 24)
        return false;

    HTTPClient http;

    String url =
        String(apiBaseUrl) +
        "/calibracao/resultado";

    http.begin(url);

    http.addHeader(
        "Content-Type",
        "application/json");

    // A API só aceita o resultado da calibração com a chave.
    adicionarChave(http);

    http.setTimeout(8000);

    StaticJsonDocument<384> doc;

    doc["id_cativeiro"] =
        cativeiroId;

    doc["tipo"] =
        calibracaoTipo;

    doc["etapa"] =
        etapa;

    if (calibracaoTipo == "motor")
    {
        doc["rotacoes"] =
            rotacoes;
    }
    else if (calibracaoTipo == "ph")
    {
        doc["tensao"] =
            valor;
    }

    String json;

    serializeJson(
        doc,
        json);

    Serial.println(
        "Enviando resultado da calibracao:");

    Serial.println(json);

    int code =
        http.POST(json);

    anotarRespostaHttp(code);

    String resposta =
        http.getString();

    http.end();

    Serial.printf(
        "HTTP calibracao resultado: %d\n",
        code);

    if (code >= 200 && code < 300)
    {
        Serial.println(
            "Resultado aceito pela API.");

        // Se a API já retornar os valores calculados,
        // aproveitamos para salvar localmente.
        StaticJsonDocument<512> retorno;

        if (deserializeJson(
                retorno,
                resposta) == DeserializationError::Ok)
        {
            if (!retorno["resultado"]
                     ["gramas_por_rotacao"]
                     .isNull())
            {
                float gpr =
                    retorno["resultado"]
                        ["gramas_por_rotacao"]
                        .as<float>();

                if (gpr > 0)
                {
                    gramasPorRotacao = gpr;

                    prefs.putFloat(
                        "gpr",
                        gramasPorRotacao);

                    Serial.printf(
                        "GPR atualizado: %.4f g/rotacao\n",
                        gramasPorRotacao);
                }
            }
        }

        return true;
    }

    Serial.println(
        "Falha ao enviar resultado da calibracao.");

    return false;
}

// ============================================================
// ALIMENTAÇÃO
// ============================================================

// Retorna true só se o motor começou a girar.
bool iniciarAlimentacao(float gramas)
{
    if (motorAtivo)
    {
        Serial.println(
            "AVISO: motor ocupado.");
        motivoFalhaAlimentacao = "Motor ocupado";
        return false;
    }

    if (gramas <= 0)
    {
        Serial.println(
            "ERRO: quantidade de racao invalida.");
        motivoFalhaAlimentacao = "Quantidade de ração inválida na dieta";
        return false;
    }

    if (gramasPorRotacao <= 0)
    {
        Serial.println(
            "ERRO: GPR invalido. Calibre o motor.");
        motivoFalhaAlimentacao = "Alimentador sem calibração";
        return false;
    }

    float rotacoes =
        gramas /
        gramasPorRotacao;

    long passos =
        (long)round(
            rotacoes *
            PASSOS_POR_ROTACAO);

    if (passos <= 0)
    {
        Serial.println(
            "ERRO: quantidade de passos invalida.");
        motivoFalhaAlimentacao = "Quantidade de ração pequena demais para o alimentador";
        return false;
    }

    Serial.println();
    Serial.println(
        "========== ALIMENTACAO ==========");

    Serial.printf(
        "Racao solicitada: %.2f g\n",
        gramas);

    Serial.printf(
        "GPR: %.4f g/rotacao\n",
        gramasPorRotacao);

    Serial.printf(
        "Rotacoes: %.4f\n",
        rotacoes);

    Serial.printf(
        "Passos: %ld\n",
        passos);

    iniciarMotorPassos(
        passos,
        1);

    return motorAtivo;
}

// ============================================================
// VERIFICAÇÃO DAS ALIMENTAÇÕES
// ============================================================

bool jaAlimentouHorario(
    String horarioAtual)
{
    for (
        int i = 0;
        i < totalAlimentacoesRealizadas;
        i++)
    {
        if (
            alimentacoesRealizadas[i] ==
            horarioAtual)
        {
            return true;
        }
    }

    return false;
}

void registrarAlimentacao(
    String horarioAtual)
{
    if (
        totalAlimentacoesRealizadas <
        20)
    {
        alimentacoesRealizadas[
            totalAlimentacoesRealizadas] =
            horarioAtual;

        totalAlimentacoesRealizadas++;
    }

    salvarAlimentacoesDoDia();
}

// Coloca o aviso na fila; é enviado no loop quando o motor parar.
// Um aviso novo do mesmo dia e horário substitui o anterior na fila
// (ex.: "falhou" e, minutos depois, "servida" dentro da janela).
void agendarRelatorioAlimentacao(
    const String &horario,
    const String &status,
    int atraso)
{
    RelatorioAlimentacao r;
    r.data = dataHoje;
    r.horario = horario;
    r.status = status;
    r.motivo = status == "falhou" ? motivoFalhaAlimentacao : "";
    r.gramas = racaoDesejada;
    r.rotacoes = gramasPorRotacao > 0 ? racaoDesejada / gramasPorRotacao : 0;
    r.atraso = atraso;

    int pos = -1;

    for (int i = 0; i < totalFilaRelatorios; i++)
    {
        if (filaRelatorios[i].data == r.data &&
            filaRelatorios[i].horario == r.horario)
        {
            pos = i;
            break;
        }
    }

    if (pos < 0)
    {
        if (totalFilaRelatorios >= MAX_FILA_RELATORIOS)
        {
            Serial.printf(
                "Fila de avisos cheia: descartando o de %s %s.\n",
                filaRelatorios[0].data.c_str(),
                filaRelatorios[0].horario.c_str());

            for (int i = 1; i < totalFilaRelatorios; i++)
                filaRelatorios[i - 1] = filaRelatorios[i];

            totalFilaRelatorios--;
        }

        pos = totalFilaRelatorios;
        totalFilaRelatorios++;
    }

    filaRelatorios[pos] = r;
    salvarFilaRelatorios();

    // Tenta enviar logo na próxima volta do loop.
    ultimoEnvioRelatorio = 0;
}

// Retorna o código HTTP (negativo = falha de rede, 0 = nem tentou).
int enviarRelatorioAlimentacao(const RelatorioAlimentacao &r)
{
    if (!redePronta())
        return 0;

    if (cativeiroId.length() < 24)
        return 0;

    HTTPClient http;

    http.begin(String(apiBaseUrl) + "/alimentacoes");
    http.addHeader("Content-Type", "application/json");
    adicionarChave(http);
    http.setTimeout(8000);

    StaticJsonDocument<384> doc;

    doc["id_cativeiro"] = cativeiroId;
    doc["data"] = r.data;
    doc["horario"] = r.horario;
    doc["status"] = r.status;
    doc["gramas"] = r.gramas;
    doc["rotacoes"] = r.rotacoes;
    doc["atraso_min"] = r.atraso;

    if (r.motivo.length() > 0)
        doc["motivo"] = r.motivo;

    String json;
    serializeJson(doc, json);

    int code = http.POST(json);
    http.end();
    anotarRespostaHttp(code);

    Serial.printf(
        "HTTP alimentacao (%s %s %s): %d\n",
        r.data.c_str(),
        r.horario.c_str(),
        r.status.c_str(),
        code);

    return code;
}

// Guarda a fila no NVS, um aviso por linha:
// data|horario|status|gramas|rotacoes|atraso|motivo
void salvarFilaRelatorios()
{
    String texto = "";

    for (int i = 0; i < totalFilaRelatorios; i++)
    {
        const RelatorioAlimentacao &r = filaRelatorios[i];

        texto += r.data + "|" + r.horario + "|" + r.status + "|" +
                 String(r.gramas, 2) + "|" + String(r.rotacoes, 4) + "|" +
                 String(r.atraso) + "|" + r.motivo + "\n";
    }

    // O NVS não aceita textos muito longos: se passar do limite,
    // descarta os avisos mais antigos até caber.
    while (texto.length() > MAX_BYTES_FILA_NVS && totalFilaRelatorios > 0)
    {
        int fimLinha = texto.indexOf('\n');
        texto = texto.substring(fimLinha + 1);

        for (int i = 1; i < totalFilaRelatorios; i++)
            filaRelatorios[i - 1] = filaRelatorios[i];

        totalFilaRelatorios--;

        Serial.println("Fila de avisos grande demais: aviso mais antigo descartado.");
    }

    if (totalFilaRelatorios == 0)
        prefs.remove("relFila");
    else if (prefs.putString("relFila", texto) == 0)
        Serial.println("ERRO: nao foi possivel salvar a fila de avisos.");
}

void carregarFilaRelatorios()
{
    String texto = prefs.getString("relFila", "");

    totalFilaRelatorios = 0;

    int inicio = 0;

    while (inicio < (int)texto.length() &&
           totalFilaRelatorios < MAX_FILA_RELATORIOS)
    {
        int fimLinha = texto.indexOf('\n', inicio);

        if (fimLinha < 0)
            fimLinha = texto.length();

        String linha = texto.substring(inicio, fimLinha);
        inicio = fimLinha + 1;

        // Separa os 7 campos; o motivo é o último e pode ser vazio.
        String campos[7];
        int n = 0;
        int ini = 0;

        while (n < 6)
        {
            int sep = linha.indexOf('|', ini);

            if (sep < 0)
                break;

            campos[n++] = linha.substring(ini, sep);
            ini = sep + 1;
        }

        if (n < 6)
            continue;

        campos[6] = linha.substring(ini);

        RelatorioAlimentacao &r = filaRelatorios[totalFilaRelatorios];
        r.data = campos[0];
        r.horario = campos[1];
        r.status = campos[2];
        r.gramas = campos[3].toFloat();
        r.rotacoes = campos[4].toFloat();
        r.atraso = campos[5].toInt();
        r.motivo = campos[6];

        totalFilaRelatorios++;
    }

    if (totalFilaRelatorios > 0)
    {
        Serial.printf(
            "Avisos de alimentação pendentes: %d\n",
            totalFilaRelatorios);
    }
}

// Guarda na memória a data e os horários servidos nela
// (ex.: "2026-11-06" e "08:00,17:00").
void salvarAlimentacoesDoDia()
{
    String lista = "";

    for (
        int i = 0;
        i < totalAlimentacoesRealizadas;
        i++)
    {
        if (i > 0)
            lista += ",";

        lista += alimentacoesRealizadas[i];
    }

    prefs.putString("alimData", dataControle);
    prefs.putString("alimFeitas", lista);
}

void carregarAlimentacoesDoDia()
{
    dataControle =
        prefs.getString("alimData", "");

    String lista =
        prefs.getString("alimFeitas", "");

    totalAlimentacoesRealizadas = 0;

    int inicio = 0;

    while (
        inicio < (int)lista.length() &&
        totalAlimentacoesRealizadas < 20)
    {
        int virgula = lista.indexOf(',', inicio);

        if (virgula < 0)
            virgula = lista.length();

        String item = lista.substring(inicio, virgula);

        if (item.length() > 0)
        {
            alimentacoesRealizadas[
                totalAlimentacoesRealizadas] = item;
            totalAlimentacoesRealizadas++;
        }

        inicio = virgula + 1;
    }

    if (totalAlimentacoesRealizadas > 0)
    {
        Serial.printf(
            "Alimentações já feitas em %s: %s\n",
            dataControle.c_str(),
            lista.c_str());
    }
}

// ============================================================
// ENVIO DOS PARÂMETROS
// ============================================================

// Retorna o código HTTP (negativo = sem resposta, 0 = nem tentou).
int enviarParametrosParaAPI(
    float temp,
    float ph,
    float amonia,
    const String &idCativeiro,
    const String &dataHoraISO)
{
    if (!redePronta())
        return 0;

    if (idCativeiro.length() < 24)
        return 0;

    HTTPClient http;

    String url =
        String(apiBaseUrl) +
        "/parametros/cadastrar";

    http.begin(url);

    http.addHeader(
        "Content-Type",
        "application/json");

    adicionarChave(http);

    http.setTimeout(8000);

    StaticJsonDocument<256> doc;

    doc["id_cativeiro"] =
        idCativeiro;

    doc["temperatura"] =
        serialized(String(temp, 2));

    doc["ph"] =
        serialized(String(ph, 2));

    doc["amonia"] =
        serialized(String(amonia, 2));

    // Identificador da amostra (horário em segundos): se o POST for
    // repetido, a API reconhece e não grava a leitura duas vezes.
    // Só vai quando o relógio está certo; antes disso o horário
    // recomeça a cada boot e poderia repetir valores antigos.
    if (ntpSincronizado)
    {
        doc["amostraId"] =
            String(timeClient.getEpochTime());

        // Horário da medição (UTC): a API grava a leitura nele.
        doc["ts"] = epochUTC();
    }

    String json;

    serializeJson(
        doc,
        json);

    int code =
        http.POST(json);

    anotarRespostaHttp(code);

    Serial.printf(
        "HTTP parametros: %d\n",
        code);

    if (code == 401)
    {
        Serial.println(
            "Leitura recusada: chave do dispositivo ausente ou errada. "
            "Gere a chave no painel e use SET DEVICEKEY.");
    }

    http.end();

    return code;
}

// ============================================================
// LEITURA E ENVIO DOS SENSORES
// ============================================================

void fetchDeDados(
    int currentHour,
    int currentMinute)
{
    // O relógio é mantido pelo timeClient.update() do loop (consulta
    // o servidor de hora a cada 60 s). Aqui só tentamos de novo se
    // ele ainda não sincronizou nenhuma vez. Sem hora certa a leitura
    // é enviada mesmo assim: a API usa o horário em que a recebeu.
    if (!ntpSincronizado)
    {
        ntpSincronizado =
            timeClient.forceUpdate();

        if (!ntpSincronizado)
        {
            Serial.println(
                "AVISO: NTP ainda não sincronizou; enviando leitura sem horário.");
        }
    }

    // Só atualiza a data com o relógio certo; senão ela viraria
    // 1970-01-01 e zeraria o controle de alimentações do dia.
    if (ntpSincronizado)
    {
        time_t epochTime =
            timeClient.getEpochTime();

        struct tm *ti =
            localtime(&epochTime);

        char dataAtual[11];

        sprintf(
            dataAtual,
            "%04d-%02d-%02d",
            1900 + ti->tm_year,
            1 + ti->tm_mon,
            ti->tm_mday);

        dataHoje =
            String(dataAtual);

        dataHoraISO =
            dataHoje +
            "T" +
            timeClient.getFormattedTime();
    }

    float ph =
        lerPH();

    float amonia =
        lerAmonia();

    sensors.requestTemperatures();

    float temp =
        sensors.getTempCByIndex(0);

    if (
        temp ==
        DEVICE_DISCONNECTED_C)
    {
        Serial.println(
            "ERRO: sensor temperatura!");

        temp = -127.0;
    }

    Serial.printf(
        "[%s %02d:%02d] Temp: %.2f C | pH: %.2f | NH3: %.2f ppm\n",
        dataHoje.c_str(),
        currentHour,
        currentMinute,
        temp,
        ph,
        amonia);

    // Sem conexão, só testa a API a cada 30 s; nas outras leituras vai
    // direto para a fila, sem esperar o tempo limite do HTTP.
    unsigned long agora = millis();

    bool tentarEnviar =
        apiOnline ||
        agora - ultimaSondagem >= intervaloSondagemOffline;

    int code = 0;

    if (tentarEnviar)
    {
        if (!apiOnline)
            ultimaSondagem = agora;

        code = enviarParametrosParaAPI(
            temp,
            ph,
            amonia,
            cativeiroId,
            dataHoraISO);
    }

    // Não chegou à API (sem rede, sem resposta, API fora do ar): guarda
    // na fila. Recusas da API (4xx, ex.: leitura inválida) não voltam.
    if (code <= 0 || code >= 500)
        acumularLeituraOffline(temp, ph, amonia);
}

// ============================================================
// FILA DE LEITURAS SEM INTERNET
// ============================================================

void salvarFilaEnviados()
{
    prefs.putUInt("filaEnv", filaEnviados);
}

void iniciarFilaLeituras()
{
    // A partição de dados do esquema padrão ("spiffs") é usada pelo
    // LittleFS; na primeira vez ela é formatada.
    filaDisponivel = LittleFS.begin(true);

    if (!filaDisponivel)
    {
        Serial.println(
            "ERRO: LittleFS indisponivel. Leituras sem internet serao perdidas.");
        return;
    }

    filaTotal = 0;

    File f = LittleFS.open(ARQUIVO_FILA, "r");

    if (f)
    {
        filaTotal = f.size() / sizeof(RegistroLeitura);
        f.close();
    }

    filaEnviados = prefs.getUInt("filaEnv", 0);

    // Arquivo apagado sem o contador ter sido zerado (ex.: reinício no
    // meio da limpeza): recomeça a contagem.
    if (filaEnviados > filaTotal)
    {
        filaEnviados = 0;
        salvarFilaEnviados();
    }

    if (filaTotal > filaEnviados)
    {
        Serial.printf(
            "Leituras sem internet pendentes: %lu\n",
            (unsigned long)(filaTotal - filaEnviados));
    }
}

// Soma a leitura na média do minuto em andamento.
void acumularLeituraOffline(float temp, float ph, float amonia)
{
    // Sem relógio certo não há como saber o horário da leitura.
    if (!filaDisponivel || !ntpSincronizado || cativeiroId.length() < 24)
        return;

    // Mesmas faixas aceitas pela API: leitura com sensor com defeito
    // (ex.: -127 °C) não entra na média.
    if (temp < -5 || temp > 50 || ph < 0 || ph > 14 || amonia < 0 || amonia > 500)
        return;

    uint32_t ts = epochUTC();
    uint32_t minuto = ts / 60;

    if (acumQuantidade > 0 && minuto != acumMinuto)
        fecharMinutoOffline(true);

    if (acumQuantidade == 0)
    {
        acumMinuto = minuto;
        acumPrimeiroTs = ts;
        acumTemp = 0;
        acumPh = 0;
        acumAmonia = 0;
    }

    acumTemp += temp;
    acumPh += ph;
    acumAmonia += amonia;
    acumQuantidade++;
}

// Grava a média do minuto na fila quando o minuto acaba (ou já, com
// forcar = true).
void fecharMinutoOffline(bool forcar)
{
    if (acumQuantidade == 0)
        return;

    if (!forcar && epochUTC() / 60 == acumMinuto)
        return;

    RegistroLeitura r;
    r.ts = acumPrimeiroTs;
    r.temp = (int16_t)lround(acumTemp / acumQuantidade * 100.0);
    r.ph = (uint16_t)lround(acumPh / acumQuantidade * 100.0);
    r.amonia = (uint16_t)lround(acumAmonia / acumQuantidade * 100.0);

    acumQuantidade = 0;

    gravarRegistroFila(r);
}

// Reescreve o arquivo só com os registros ainda não enviados.
bool compactarFila()
{
    File origem = LittleFS.open(ARQUIVO_FILA, "r");

    if (!origem)
        return false;

    File destino = LittleFS.open(ARQUIVO_FILA_TMP, "w");

    if (!destino)
    {
        origem.close();
        return false;
    }

    origem.seek((size_t)filaEnviados * sizeof(RegistroLeitura));

    uint8_t buffer[512];
    bool ok = true;

    while (origem.available())
    {
        size_t lidos = origem.read(buffer, sizeof(buffer));

        if (lidos == 0 || destino.write(buffer, lidos) != lidos)
        {
            ok = false;
            break;
        }
    }

    origem.close();
    destino.close();

    if (!ok)
    {
        LittleFS.remove(ARQUIVO_FILA_TMP);
        return false;
    }

    LittleFS.remove(ARQUIVO_FILA);
    LittleFS.rename(ARQUIVO_FILA_TMP, ARQUIVO_FILA);

    filaTotal -= filaEnviados;
    filaEnviados = 0;
    salvarFilaEnviados();

    return true;
}

void gravarRegistroFila(const RegistroLeitura &r)
{
    // Mais de 30 dias pendentes: a API não aceitaria o mais antigo.
    if (filaTotal - filaEnviados >= MAX_PENDENTES_FILA)
    {
        filaEnviados++;
        salvarFilaEnviados();
    }

    if (filaTotal >= MAX_REGISTROS_ARQUIVO && !compactarFila())
    {
        Serial.println("ERRO: nao foi possivel compactar a fila de leituras.");
        return;
    }

    File f = LittleFS.open(ARQUIVO_FILA, "a");

    if (!f)
    {
        Serial.println("ERRO: nao foi possivel abrir a fila de leituras.");
        return;
    }

    size_t gravados = f.write((const uint8_t *)&r, sizeof(r));
    f.close();

    if (gravados != sizeof(r))
    {
        Serial.println("ERRO: nao foi possivel gravar na fila de leituras.");
        return;
    }

    filaTotal++;

    Serial.printf(
        "Leitura guardada na fila (pendentes: %lu)\n",
        (unsigned long)(filaTotal - filaEnviados));
}

// Envia o próximo lote da fila. Retorna o código HTTP (0 = nada a enviar
// ou sem rede).
int enviarLoteDaFila()
{
    if (!filaDisponivel || filaTotal <= filaEnviados)
        return 0;

    if (!redePronta())
        return 0;

    if (cativeiroId.length() < 24)
        return 0;

    File f = LittleFS.open(ARQUIVO_FILA, "r");

    if (!f)
        return 0;

    f.seek((size_t)filaEnviados * sizeof(RegistroLeitura));

    String json;
    json.reserve(LEITURAS_POR_LOTE * 100 + 64);
    json = "{\"id_cativeiro\":\"" + cativeiroId + "\",\"leituras\":[";

    int quantidade = 0;
    RegistroLeitura r;

    while (quantidade < LEITURAS_POR_LOTE &&
           f.read((uint8_t *)&r, sizeof(r)) == sizeof(r))
    {
        if (quantidade > 0)
            json += ",";

        json += "{\"ts\":" + String(r.ts) +
                ",\"amostraId\":\"m" + String(r.ts) +
                "\",\"temperatura\":" + String(r.temp / 100.0, 2) +
                ",\"ph\":" + String(r.ph / 100.0, 2) +
                ",\"amonia\":" + String(r.amonia / 100.0, 2) + "}";

        quantidade++;
    }

    f.close();

    json += "]}";

    if (quantidade == 0)
        return 0;

    HTTPClient http;

    http.begin(String(apiBaseUrl) + "/parametros/lote");
    http.addHeader("Content-Type", "application/json");
    adicionarChave(http);
    http.setTimeout(15000);

    int code = http.POST(json);
    http.end();
    anotarRespostaHttp(code);

    Serial.printf(
        "HTTP lote da fila (%d leituras): %d\n",
        quantidade,
        code);

    // 200: a API guardou (as leituras que ela recusar nunca seriam
    // aceitas). 400: o lote inteiro é inválido. Nos dois casos, sai da
    // fila. Outro código (sem rede, chave errada, API fora): tenta depois.
    if (code == 200 || code == 400)
    {
        filaEnviados += quantidade;

        if (filaEnviados >= filaTotal)
        {
            // Fila vazia: apaga o arquivo e recomeça.
            LittleFS.remove(ARQUIVO_FILA);
            filaTotal = 0;
            filaEnviados = 0;

            Serial.println("Fila de leituras enviada por completo.");
        }

        salvarFilaEnviados();
    }

    return code;
}

// ============================================================
// CONFIGURAÇÃO INICIAL
// ============================================================

void mostrarConfiguracoes()
{
    Serial.println(
        "\n===== CONFIGURACAO INICIAL (15s) =====");

    Serial.println(
        "Comandos disponíveis:");

    Serial.println(
        "  SET SSID <nome_da_rede>");

    Serial.println(
        "  SET PASS <senha>");

    Serial.println(
        "  SET URL <api_base_url>");

    Serial.println(
        "  SET CATIVEIRO <ObjectId>");

    Serial.println(
        "  SET DEVICEKEY <chave gerada no painel>");

    Serial.println(
        "  SET GPR <gramas_por_rotacao>");

    Serial.println(
        "========================================");

    if (!savedSSID.isEmpty())
    {
        Serial.println(
            "SSID salvo: " +
            savedSSID +
            "  (Enter para manter)");
    }

    if (!apiBaseUrl.isEmpty())
    {
        Serial.println(
            "API Base URL salvo: " +
            apiBaseUrl +
            "  (Enter para manter)");
    }

    if (!cativeiroId.isEmpty())
    {
        Serial.println(
            "CativeiroId salvo: " +
            cativeiroId +
            "  (Enter para manter)");
    }

    // Nunca imprime a chave inteira: o log serial pode ser copiado.
    if (deviceKey.isEmpty())
    {
        Serial.println(
            "Chave do dispositivo: NAO configurada");
    }
    else
    {
        Serial.println(
            "Chave do dispositivo: configurada (termina em " +
            deviceKey.substring(deviceKey.length() - 4) +
            ")");
    }

    Serial.printf(
        "GPR salvo: %.4f g/rotacao\n",
        gramasPorRotacao);

    Serial.println(
        "========================================");
}

void setup()
{
    Serial.begin(115200);

    delay(3000);

    // ADC
    analogReadResolution(12);

    analogSetAttenuation(
        ADC_11db);

    // Pinos do motor
    pinMode(
        motorIN1,
        OUTPUT);

    pinMode(
        motorIN2,
        OUTPUT);

    pinMode(
        motorIN3,
        OUTPUT);

    pinMode(
        motorIN4,
        OUTPUT);

    criarTimerMotor();
    desligarMotor();

    // Memória
    prefs.begin(
        "camarize",
        false);

    cativeiroId =
        prefs.getString(
            "cativId",
            "");

    gramasPorRotacao =
        prefs.getFloat(
            "gpr",
            0.0);

    tensaoPH7 =
        prefs.getFloat(
            "ph7",
            0.0);

    tensaoPH4 =
        prefs.getFloat(
            "ph4",
            0.0);

    possuiCalibracaoPH =
        prefs.getBool(
            "phCal",
            false);

    savedSSID =
        prefs.getString(
            "ssid",
            "");

    savedPassword =
        prefs.getString(
            "pass",
            "");

    apiBaseUrl =
        prefs.getString(
            "apiUrl",
            "http://SEU_HOST_OU_IP:4000");

    // Mesmo nome usado pelo firmware anterior: placas que já
    // tinham a chave configurada continuam com ela.
    deviceKey =
        prefs.getString(
            "deviceKey",
            "");

    carregarAlimentacoesDoDia();
    carregarFilaRelatorios();
    iniciarFilaLeituras();

    mostrarConfiguracoes();

    unsigned long start =
        millis();

    unsigned long ultimoTick =
        0;

    while (
        millis() - start <
        15000)
    {
        if (Serial.available())
        {
            String line =
                Serial.readStringUntil('\n');

            line.trim();

            // -------------------------------
            // SSID
            // -------------------------------

            if (
                line.startsWith("SET SSID ") ||
                line.startsWith("set ssid "))
            {
                String val =
                    line.substring(9);

                val.trim();

                if (!val.isEmpty())
                {
                    savedSSID = val;

                    prefs.putString(
                        "ssid",
                        savedSSID);

                    Serial.println(
                        "SSID salvo: " +
                        savedSSID);

                    start = millis();
                }
            }

            // -------------------------------
            // SENHA
            // -------------------------------

            else if (
                line.startsWith("SET PASS ") ||
                line.startsWith("set pass "))
            {
                String val =
                    line.substring(9);

                val.trim();

                savedPassword =
                    val;

                prefs.putString(
                    "pass",
                    savedPassword);

                Serial.println(
                    "Senha salva.");

                start = millis();
            }

            // -------------------------------
            // URL
            // -------------------------------

            else if (
                line.startsWith("SET URL ") ||
                line.startsWith("set url "))
            {
                String val =
                    line.substring(8);

                val.trim();

                if (!val.isEmpty())
                {
                    apiBaseUrl =
                        val;

                    prefs.putString(
                        "apiUrl",
                        apiBaseUrl);

                    Serial.println(
                        "API Base URL salva: " +
                        apiBaseUrl);

                    start = millis();
                }
            }

            // -------------------------------
            // CATIVEIRO
            // -------------------------------

            else if (
                line.startsWith(
                    "SET CATIVEIRO ") ||
                line.startsWith(
                    "set cativeiro "))
            {
                String val =
                    line.substring(14);

                val.trim();

                if (val.length() >= 24)
                {
                    cativeiroId =
                        val;

                    prefs.putString(
                        "cativId",
                        cativeiroId);

                    Serial.println(
                        "cativeiroId salvo: " +
                        cativeiroId);

                    start = millis();
                }
                else
                {
                    Serial.println(
                        "ObjectId inválido (mínimo 24 chars).");
                }
            }

            // -------------------------------
            // CHAVE DO DISPOSITIVO
            // -------------------------------

            else if (
                line.startsWith(
                    "SET DEVICEKEY ") ||
                line.startsWith(
                    "set devicekey "))
            {
                String val =
                    line.substring(14);

                val.trim();

                // A chave gerada pela API tem 64 caracteres hexadecimais.
                bool valida =
                    val.length() == 64;

                for (unsigned int i = 0; valida && i < val.length(); i++)
                {
                    if (!isxdigit(val[i]))
                        valida = false;
                }

                if (valida)
                {
                    deviceKey =
                        val;

                    prefs.putString(
                        "deviceKey",
                        deviceKey);

                    Serial.println(
                        "Chave do dispositivo salva.");

                    start = millis();
                }
                else
                {
                    Serial.println(
                        "Chave inválida: copie os 64 caracteres gerados no painel.");
                }
            }

            // -------------------------------
            // GPR
            // -------------------------------

            else if (
                line.startsWith(
                    "SET GPR ") ||
                line.startsWith(
                    "set gpr "))
            {
                float gpr =
                    line.substring(8).toFloat();

                if (gpr > 0)
                {
                    gramasPorRotacao =
                        gpr;

                    prefs.putFloat(
                        "gpr",
                        gramasPorRotacao);

                    Serial.printf(
                        "Motor: %.4f g/rotacao\n",
                        gramasPorRotacao);

                    start = millis();
                }
            }
        }

        if (
            millis() - ultimoTick >=
            2000)
        {
            ultimoTick =
                millis();

            int restam =
                (int)(
                    (15000 -
                     (millis() - start)) /
                    1000);

            if (restam >= 0)
            {
                Serial.printf(
                    "(%ds para continuar...)\n",
                    restam);
            }
        }

        delay(20);
    }

    // ----------------------------------------
    // WIFI
    // ----------------------------------------

    if (savedSSID.isEmpty())
    {
        Serial.println(
            "ERRO FATAL: SSID não configurado. Reinicie e configure.");

        while (true)
            delay(1000);
    }

    if (cativeiroId.isEmpty())
    {
        Serial.println(
            "AVISO: cativeiroId não configurado.");
    }

    Serial.printf(
        "\nConectando em %s...\n",
        savedSSID.c_str());

    WiFi.begin(
        savedSSID.c_str(),
        savedPassword.c_str());

    unsigned long t =
        millis();

    while (
        WiFi.status() !=
            WL_CONNECTED &&
        millis() - t <
            20000)
    {
        delay(500);

        Serial.print(".");
    }

    if (
        WiFi.status() ==
        WL_CONNECTED)
    {
        Serial.println(
            "\nWiFi conectado! IP: " +
            WiFi.localIP().toString());
    }
    else
    {
        Serial.println(
            "\nFalha no WiFi. Verifique SSID/senha e reinicie.");

        while (true)
        {
            Serial.print(".");
            delay(1000);
        }
    }

    // ----------------------------------------
    // NTP
    // ----------------------------------------

    timeClient.begin();

    for (
        int i = 0;
        i < 10 &&
        !ntpSincronizado;
        i++)
    {
        ntpSincronizado =
            timeClient.update();

        delay(500);
    }

    if (!ntpSincronizado)
    {
        Serial.println(
            "AVISO: NTP não sincronizou no boot.");
    }

    // ----------------------------------------
    // SENSOR DE TEMPERATURA
    // ----------------------------------------

    sensors.begin();

    // ----------------------------------------
    // PRIMEIRAS CONSULTAS
    // ----------------------------------------

    buscarDietaDaAPI();

    buscarCalibracaoDaAPI();

    int currentHour =
        timeClient.getHours();

    int currentMinute =
        timeClient.getMinutes();

    fetchDeDados(
        currentHour,
        currentMinute);

    ultimoFetchDieta =
        millis();

    ultimoEnvioDados =
        millis();

    ultimoFetchCalibracao =
        millis();
}

// ============================================================
// LOOP PRINCIPAL
// ============================================================

void loop()
{
    // Os passos do motor são dados pelo timer (processarMotor), então
    // o loop() pode esperar a rede sem parar o motor. Aqui só
    // avisamos no Serial quando ele termina.
    if (motorFinalizouAviso)
    {
        motorFinalizouAviso = false;

        Serial.printf(
            "Motor finalizado. Passos executados: %ld\n",
            (long)passosMotorExecutados);
    }

    unsigned long agora =
        millis();

    // --------------------------------------------------------
    // MOTOR EM MOVIMENTO
    // --------------------------------------------------------

    // Enquanto o motor gira (alimentação ou calibração), a placa
    // só cuida dele. Leituras, dieta e NTP ficam para depois; a
    // calibração continua sendo consultada para o "Cancelar" do
    // painel parar o motor.
    if (motorAtivo)
    {
        if (
            apiOnline &&
            agora - ultimoFetchCalibracao >=
            intervaloCalibracao)
        {
            ultimoFetchCalibracao =
                agora;

            buscarCalibracaoDaAPI();
        }

        if (
            agora - ultimoLogMotor >=
            intervaloLogMotor)
        {
            ultimoLogMotor =
                agora;

            portENTER_CRITICAL(&muxMotor);
            long feitos = passosMotorExecutados;
            long total = feitos + passosRestantes;
            portEXIT_CRITICAL(&muxMotor);

            Serial.printf(
                "Motor: %ld/%ld passos\n",
                feitos,
                total);
        }

        delay(1);
        return;
    }

    // update() só consulta o servidor de hora a cada 60 s. Se a
    // consulta falha, a biblioteca tenta de novo a cada chamada,
    // travando o loop ~1 s por vez; por isso só chamamos a cada 10 s.
    if (
        agora - ultimaTentativaNTP >=
        intervaloTentativaNTP)
    {
        ultimaTentativaNTP =
            agora;

        if (timeClient.update())
            ntpSincronizado = true;
    }

    int currentHour =
        timeClient.getHours();

    int currentMinute =
        timeClient.getMinutes();

    // --------------------------------------------------------
    // ATUALIZAÇÃO DOS SENSORES / API
    // --------------------------------------------------------

    // Envia leituras dos sensores 12 vezes por minuto
    // (intervalo de 5 segundos).
    if (
        agora - ultimoEnvioDados >=
        intervaloEnvioDados)
    {
        ultimoEnvioDados =
            agora;

        fetchDeDados(
            currentHour,
            currentMinute);
    }

    // Grava a média do minuto sem internet quando o minuto acaba.
    fecharMinutoOffline(false);

    // Fila de leituras sem internet: com a API respondendo, envia um
    // lote por vez (1 s entre lotes; 30 s depois de uma falha).
    if (
        apiOnline &&
        filaTotal > filaEnviados &&
        (ultimoEnvioLote == 0 ||
         agora - ultimoEnvioLote >= intervaloEnvioLote))
    {
        int code = enviarLoteDaFila();

        ultimoEnvioLote = agora > 0 ? agora : 1;
        intervaloEnvioLote =
            (code == 200 || code == 400)
                ? INTERVALO_LOTE_OK
                : INTERVALO_LOTE_FALHA;
    }

    // Avisos de alimentação para a API, um por volta do loop, do mais
    // antigo para o mais novo (o loop só chega aqui com o motor parado,
    // então não atrasa a refeição). Sem conexão, esperam ela voltar.
    if (
        apiOnline &&
        totalFilaRelatorios > 0 &&
        (ultimoEnvioRelatorio == 0 ||
         agora - ultimoEnvioRelatorio >=
             intervaloEnvioRelatorio))
    {
        int code = enviarRelatorioAlimentacao(filaRelatorios[0]);

        // 2xx: a API guardou. 400: o aviso é inválido e nunca seria
        // aceito. Qualquer outra resposta (sem rede, chave errada,
        // API fora do ar) mantém o aviso na fila para tentar de novo.
        if ((code >= 200 && code < 300) || code == 400)
        {
            for (int i = 1; i < totalFilaRelatorios; i++)
                filaRelatorios[i - 1] = filaRelatorios[i];

            totalFilaRelatorios--;
            salvarFilaRelatorios();

            // Envia o próximo da fila logo em seguida.
            ultimoEnvioRelatorio = 0;
        }
        else
        {
            ultimoEnvioRelatorio = agora > 0 ? agora : 1;
        }
    }

    // Atualiza a dieta uma vez por minuto. Sem conexão, a placa segue
    // com a última dieta recebida.
    if (
        apiOnline &&
        agora - ultimoFetchDieta >=
        intervaloFetchDieta)
    {
        ultimoFetchDieta =
            agora;

        buscarDietaDaAPI();
    }

    // --------------------------------------------------------
    // CONSULTA DA CALIBRAÇÃO
    // --------------------------------------------------------

    if (
        apiOnline &&
        agora -
            ultimoFetchCalibracao >=
        intervaloCalibracao)
    {
        ultimoFetchCalibracao =
            agora;

        buscarCalibracaoDaAPI();
    }

    // --------------------------------------------------------
    // DETECTA NOVO DIA
    // --------------------------------------------------------

    // Só com o relógio sincronizado (antes disso a data ainda
    // está vazia e apagaria as alimentações salvas de hoje).
    if (
        dataHoje.length() > 0 &&
        dataControle !=
        dataHoje)
    {
        dataControle =
            dataHoje;

        totalAlimentacoesRealizadas =
            0;

        salvarAlimentacoesDoDia();
    }

    // --------------------------------------------------------
    // ALIMENTAÇÃO PROGRAMADA
    // --------------------------------------------------------

    // Não alimenta enquanto estiver em calibração.
    // Também não inicia uma nova alimentação enquanto
    // o motor estiver ocupado, nem antes de o relógio
    // sincronizar (a hora ainda estaria errada).

    if (
        ntpSincronizado &&
        dataHoje.length() > 0 &&
        !calibracaoAtiva &&
        !motorAtivo &&
        (ultimaFalhaAlimentacao == 0 ||
         agora - ultimaFalhaAlimentacao >=
             intervaloRetentativaAlimentacao))
    {
        int minutoDoDia =
            currentHour * 60 + currentMinute;

        for (
            int i = 0;
            i < quantidadeHorarios;
            i++)
        {
            String horario =
                horariosAlimentacao[i];

            int h = 0;
            int m = 0;

            if (
                sscanf(
                    horario.c_str(),
                    "%d:%d",
                    &h,
                    &m) != 2)
                continue;

            // Minutos desde o horário programado (não atravessa
            // a meia-noite: um horário 23:55 só vale até 23:59).
            int atraso =
                minutoDoDia - (h * 60 + m);

            if (
                atraso < 0 ||
                atraso > JANELA_ATRASO_MIN ||
                jaAlimentouHorario(horario))
                continue;

            if (atraso > 0)
            {
                Serial.printf(
                    "Alimentação das %s com %d min de atraso.\n",
                    horario.c_str(),
                    atraso);
            }

            // Só conta como feita se o motor começou a girar;
            // senão tenta de novo daqui a 1 min, dentro da janela.
            if (iniciarAlimentacao(racaoDesejada))
            {
                registrarAlimentacao(horario);
                ultimaFalhaAlimentacao = 0;
                agendarRelatorioAlimentacao(horario, "servida", atraso);
            }
            else
            {
                ultimaFalhaAlimentacao = agora > 0 ? agora : 1;

                // Avisa a falha uma vez; se der certo depois, dentro
                // da janela, o aviso de "servida" substitui este.
                String chaveFalha = dataHoje + " " + horario;
                if (falhaAvisada != chaveFalha)
                {
                    falhaAvisada = chaveFalha;
                    agendarRelatorioAlimentacao(horario, "falhou", atraso);
                }
            }

            break;
        }
    }

    // --------------------------------------------------------
    // FINALIZAÇÃO DA CALIBRAÇÃO DO MOTOR
    // --------------------------------------------------------

    if (
        calibracaoAtiva &&
        calibracaoTipo == "motor" &&
        calibracaoEtapa == "executar" &&
        motorCalibracaoIniciada &&
        !motorAtivo &&
        !motorResultadoEnviado &&
        (ultimaTentativaResultadoMotor == 0 ||
         agora - ultimaTentativaResultadoMotor >=
             intervaloTentativaResultado))
    {
        ultimaTentativaResultadoMotor =
            agora;

        Serial.println(
            "Enviando conclusão da execução do motor...");

        // A API espera a mesma etapa que mandou executar.
        if (
            enviarResultadoCalibracao(
                "executar",
                0,
                calibracaoRotacoes))
        {
            motorResultadoEnviado =
                true;
        }
    }

    delay(2);
}
