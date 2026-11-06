#include <WiFi.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

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

WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", -10800);

bool ntpSincronizado = false;

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

String alimentacoesRealizadas[20];
int totalAlimentacoesRealizadas = 0;

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

int passoAtual = 0;

bool motorAtivo = false;
long passosRestantes = 0;
long passosMotorExecutados = 0;

int direcaoMotor = 1;
unsigned long ultimoPassoUs = 0;

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
void processarMotor();

float lerTensaoPH();
float lerPH();

float lerAmonia();

void buscarDietaDaAPI();
void buscarCalibracaoDaAPI();

void enviarParametrosParaAPI(
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

void iniciarAlimentacao(float gramas);

void reconectarWiFi();

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

void aplicarPasso(int indice)
{
    digitalWrite(motorIN1, sequenciaMotor[indice][0]);
    digitalWrite(motorIN2, sequenciaMotor[indice][1]);
    digitalWrite(motorIN3, sequenciaMotor[indice][2]);
    digitalWrite(motorIN4, sequenciaMotor[indice][3]);
}

void desligarMotor()
{
    digitalWrite(motorIN1, LOW);
    digitalWrite(motorIN2, LOW);
    digitalWrite(motorIN3, LOW);
    digitalWrite(motorIN4, LOW);

    motorAtivo = false;
    passosRestantes = 0;
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

    passosRestantes = passos;
    passosMotorExecutados = 0;
    direcaoMotor = (direcao >= 0) ? 1 : -1;

    motorAtivo = true;
    ultimoPassoUs = micros();

    Serial.printf(
        "Motor iniciado: %ld passos | direção: %d\n",
        passos,
        direcaoMotor);
}

void processarMotor()
{
    if (!motorAtivo)
        return;

    unsigned long agoraUs = micros();

    if ((unsigned long)(agoraUs - ultimoPassoUs) < INTERVALO_PASSO_US)
        return;

    ultimoPassoUs = agoraUs;

    passoAtual += direcaoMotor;

    if (passoAtual > 7)
        passoAtual = 0;

    if (passoAtual < 0)
        passoAtual = 7;

    aplicarPasso(passoAtual);

    passosRestantes--;
    passosMotorExecutados++;

    if (passosRestantes <= 0)
    {
        desligarMotor();

        Serial.printf(
            "Motor finalizado. Passos executados: %ld\n",
            passosMotorExecutados);
    }
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

void reconectarWiFi()
{
    if (WiFi.status() == WL_CONNECTED)
        return;

    Preferences p;

    p.begin("camarize", true);

    String s = p.getString("ssid", "");
    String w = p.getString("pass", "");

    p.end();

    if (s.isEmpty())
        return;

    WiFi.disconnect();
    WiFi.begin(s.c_str(), w.c_str());

    unsigned long t = millis();

    while (
        WiFi.status() != WL_CONNECTED &&
        millis() - t < 15000)
    {
        delay(500);
    }
}

// ============================================================
// DIETA
// ============================================================

void buscarDietaDaAPI()
{
    reconectarWiFi();

    if (WiFi.status() != WL_CONNECTED)
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
    else
    {
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
    reconectarWiFi();

    if (WiFi.status() != WL_CONNECTED)
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
    reconectarWiFi();

    if (WiFi.status() != WL_CONNECTED)
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

void iniciarAlimentacao(float gramas)
{
    if (motorAtivo)
    {
        Serial.println(
            "AVISO: motor ocupado.");
        return;
    }

    if (gramas <= 0)
    {
        Serial.println(
            "ERRO: quantidade de racao invalida.");
        return;
    }

    if (gramasPorRotacao <= 0)
    {
        Serial.println(
            "ERRO: GPR invalido. Calibre o motor.");
        return;
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
        return;
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
}

// ============================================================
// ENVIO DOS PARÂMETROS
// ============================================================

void enviarParametrosParaAPI(
    float temp,
    float ph,
    float amonia,
    const String &idCativeiro,
    const String &dataHoraISO)
{
    reconectarWiFi();

    if (WiFi.status() != WL_CONNECTED)
        return;

    if (idCativeiro.length() < 24)
        return;

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
    }

    String json;

    serializeJson(
        doc,
        json);

    int code =
        http.POST(json);

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

    Serial.println(
        "\nDADOS ENVIADOS PARA API\n");
}

// ============================================================
// LEITURA E ENVIO DOS SENSORES
// ============================================================

void fetchDeDados(
    int currentHour,
    int currentMinute)
{
    reconectarWiFi();

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

    enviarParametrosParaAPI(
        temp,
        ph,
        amonia,
        cativeiroId,
        dataHoraISO);
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
    // O motor dá um passo por volta do loop: qualquer coisa que
    // trave o loop (HTTP, sensores, NTP) deixa o motor parado.
    processarMotor();

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

            Serial.printf(
                "Motor: %ld/%ld passos\n",
                passosMotorExecutados,
                passosMotorExecutados + passosRestantes);
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

    // Atualiza a dieta uma vez por minuto.
    if (
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

    if (
        dataControle !=
        dataHoje)
    {
        dataControle =
            dataHoje;

        totalAlimentacoesRealizadas =
            0;
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
        !calibracaoAtiva &&
        !motorAtivo)
    {
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
                    &m) == 2)
            {
                bool horaCerta =
                    (
                        currentHour == h &&
                        currentMinute == m
                    );

                bool alimentacaoJaFeita =
                    jaAlimentouHorario(
                        horario);

                if (
                    horaCerta &&
                    !alimentacaoJaFeita)
                {
                    iniciarAlimentacao(
                        racaoDesejada);

                    registrarAlimentacao(
                        horario);

                    break;
                }
            }
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
