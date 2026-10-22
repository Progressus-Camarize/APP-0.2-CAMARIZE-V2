#include <WiFi.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ─── Persistência ────────────────────────────────────────
Preferences prefs;
String cativeiroId;

// ─── WiFi ────────────────────────────────────────────────
String savedSSID;
String savedPassword;

// ─── API ─────────────────────────────────────────────────
String apiBaseUrl;
String deviceKey;

// ─── NTP (UTC-3) ─────────────────────────────────────────
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", -10800);
bool ntpSincronizado = false;

// ─── Pinos ───────────────────────────────────────────────
const int pHPin = 35;
const int amoniaPin = 34;
const int tempPin = 32;
const int relePin = 33;

// ─── Sensor de temperatura ───────────────────────────────
OneWire oneWire(tempPin);
DallasTemperature sensors(&oneWire);

// ─── Alimentação ─────────────────────────────────────────
int horaAlvo = 17;
int minutoAlvo = 0;
float racaoDesejada = 25.0; // gramas
float gramas_por_segundo = 5.0;
String ultimaDataAlimentacao = "";

// ─── Timing sem delay() ──────────────────────────────────
unsigned long ultimoFetch = 0;
const unsigned long intervaloFetch = 60000UL; // 1 minuto

unsigned long motorLigadoEm = 0;
unsigned long duracaoMotor = 0;
bool motorAtivo = false;

// ─────────────────────────────────────────────────────────
void reconectarWiFi()
{
    if (WiFi.status() == WL_CONNECTED)
        return;
    Serial.println("WiFi perdido. Reconectando...");

    // Lê da NVS em vez de usar constantes
    Preferences p;
    p.begin("camarize", true); // true = somente leitura
    String s = p.getString("ssid", "");
    String w = p.getString("pass", "");
    p.end();

    WiFi.disconnect();
    WiFi.begin(s.c_str(), w.c_str());

    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 15000)
    {
        delay(500);
        Serial.print(".");
    }
    Serial.println(WiFi.status() == WL_CONNECTED
                       ? "\nWiFi reconectado!"
                       : "\nFalha na reconexão!");
}

// ─────────────────────────────────────────────────────────
void ligarMotorPorTempo(float gramas)
{
    unsigned long ms = (unsigned long)((gramas / gramas_por_segundo) * 1000.0);
    Serial.printf("Motor ligado por %lu ms para %.1f g\n", ms, gramas);
    digitalWrite(relePin, HIGH); // ativa relé (ajuste para LOW se o seu for ativo-baixo)
    motorLigadoEm = millis();
    duracaoMotor = ms;
    motorAtivo = true;
}

// ─────────────────────────────────────────────────────────
void verificarMotor()
{
    if (motorAtivo && millis() - motorLigadoEm >= duracaoMotor)
    {
        digitalWrite(relePin, LOW);
        motorAtivo = false;
        Serial.println("Motor desligado.");
    }
}

// ─────────────────────────────────────────────────────────
float lerPH()
{
    // Média de 10 leituras para reduzir ruído
    long soma = 0;
    for (int i = 0; i < 10; i++)
    {
        soma += analogRead(pHPin);
        delay(10);
    }
    float voltage = ((soma / 10.0) / 4095.0) * 3.3;
    // Equação de calibração: ajuste os coeficientes com seu sensor
    float ph = 7.0 + ((2.5 - voltage) / 0.18);
    return ph;
}

// ─────────────────────────────────────────────────────────
float lerAmonia()
{
    long soma = 0;
    for (int i = 0; i < 10; i++)
    {
        soma += analogRead(amoniaPin);
        delay(10);
    }
    float voltage = ((soma / 10.0) / 4095.0) * 3.3;
    // Ajuste conforme datasheet do seu sensor (MQ-135 ou similar)
    // Abaixo é uma aproximação linear — calibrar em campo
    float ppm = voltage * 100.0;
    return ppm;
}

// ─────────────────────────────────────────────────────────
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
    String url = String(apiBaseUrl) + "/dietas/atual/" + cativeiroId;
    http.begin(url);
    http.setTimeout(8000);
    // Prepara a API para exigir a chave do dispositivo também na leitura da dieta
    if (!deviceKey.isEmpty())
        http.addHeader("X-Device-Key", deviceKey);

    int code = http.GET();
    if (code == 200)
    {
        String payload = http.getString();
        Serial.println("Dieta recebida: " + payload);

        // 512 bytes — seguro para JSONs com alguns campos de string
        StaticJsonDocument<512> doc;
        DeserializationError err = deserializeJson(doc, payload);

        if (!err)
        {
            if (!doc["horaAlimentacao"].isNull())
            {
                const char *horaStr = doc["horaAlimentacao"];
                int h = 0, m = 0;
                if (sscanf(horaStr, "%d:%d", &h, &m) == 2)
                {
                    horaAlvo = h;
                    minutoAlvo = m;
                    Serial.printf("Hora alimentação: %02d:%02d\n", horaAlvo, minutoAlvo);
                }
            }
            if (!doc["quantidade"].isNull())
            {
                racaoDesejada = doc["quantidade"].as<float>();
                Serial.printf("Ração: %.2f g\n", racaoDesejada);
            }
            if (!doc["descricao"].isNull())
            {
                Serial.printf("Dieta: %s\n", doc["descricao"].as<const char *>());
            }
        }
        else
        {
            Serial.println("Erro ao parsear JSON dieta: " + String(err.c_str()));
        }
    }
    else
    {
        Serial.printf("Erro HTTP dieta: %d\n", code);
    }
    http.end();
}

// ─────────────────────────────────────────────────────────
void enviarParametrosParaAPI(float temp, float ph, float amonia,
                             const String &idCativeiro,
                             const String &dataHoraISO)
{
    reconectarWiFi();
    if (WiFi.status() != WL_CONNECTED)
        return;
    if (idCativeiro.length() < 24)
    {
        Serial.println("cativeiroId inválido.");
        return;
    }

    HTTPClient http;
    String url = String(apiBaseUrl) + "/parametros/cadastrar";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    if (!deviceKey.isEmpty()) http.addHeader("X-Device-Key", deviceKey);
    http.setTimeout(8000);

    // Monta JSON com ArduinoJson — seguro contra erros de concatenação
    StaticJsonDocument<256> doc;
    doc["id_cativeiro"] = idCativeiro;
    doc["temperatura"] = serialized(String(temp, 2));
    doc["ph"] = serialized(String(ph, 2));
    doc["amonia"] = serialized(String(amonia, 2));
    doc["amostraId"] = String(timeClient.getEpochTime());
    // doc["dataHora"]  = dataHoraISO; // descomente se a API aceitar

    String json;
    serializeJson(doc, json);

    int code = http.POST(json);
    if (code > 0)
    {
        Serial.println("POST OK: " + http.getString());
    }
    else
    {
        Serial.printf("Erro POST: %d\n", code);
    }
    http.end();
}

// ─────────────────────────────────────────────────────────
void setup()
{
    Serial.begin(9600);
    delay(2000);
    analogSetAttenuation(ADC_11db);

    pinMode(relePin, OUTPUT);
    digitalWrite(relePin, HIGH);

    // ─── Carregar NVS ────────────────────────────────────────
    prefs.begin("camarize", false);
    cativeiroId = prefs.getString("cativId", "");
    gramas_por_segundo = prefs.getFloat("gps", 5.0);
    savedSSID = prefs.getString("ssid", "");
    savedPassword = prefs.getString("pass", "");
    apiBaseUrl = prefs.getString("apiUrl", "http://SEU_HOST_OU_IP:4000");
    deviceKey = prefs.getString("deviceKey", "");

    // ─── Janela de configuração via Serial (10s) ─────────────
    Serial.println("\n===== CONFIGURAÇÃO INICIAL (10s) =====");
    Serial.println("Comandos disponíveis:");
    Serial.println("  SET SSID <nome_da_rede>");
    Serial.println("  SET PASS <senha>");
    Serial.println("  SET URL <api_base_url>");
    Serial.println("  SET CATIVEIRO <ObjectId>");
    Serial.println("  SET DEVICEKEY <chave gerada pela API>");
    Serial.println("  SET GPS <gramas_por_segundo>");
    if (!savedSSID.isEmpty())
        Serial.println("SSID salvo:       " + savedSSID + "  (Enter para manter)");
    if (!apiBaseUrl.isEmpty())
        Serial.println("API Base URL salvo: " + apiBaseUrl + "  (Enter para manter)");
    if (!cativeiroId.isEmpty())
        Serial.println("CativeiroId salvo: " + cativeiroId + "  (Enter para manter)");
    Serial.printf("Gramas/segundo salvo: %.2f  (Enter para manter)\n", gramas_por_segundo);
    Serial.println("==================================================");

    unsigned long start = millis();
    unsigned long ultimoTick = 0;

    while (millis() - start < 15000)
    {
        if (Serial.available())
        {
            String line = Serial.readStringUntil('\n');
            line.trim();

            if (line.startsWith("SET SSID ") || line.startsWith("set ssid "))
            {
                String val = line.substring(9);
                val.trim();
                if (!val.isEmpty())
                { //  ssid não pode ser vazio
                    savedSSID = val;
                    prefs.putString("ssid", savedSSID);
                    Serial.println("SSID salvo: " + savedSSID);
                    start = millis();
                }
            }
            else if (line.startsWith("SET PASS ") || line.startsWith("set pass "))
            {
                String val = line.substring(9);
                val.trim();
                savedPassword = val;
                prefs.putString("pass", savedPassword);
                Serial.println("Senha salva.");
                start = millis();
            }
            else if (line.startsWith("SET URL ") || line.startsWith("set url "))
            {
                String val = line.substring(8);
                val.trim();
                if (!val.isEmpty())
                {
                    apiBaseUrl = val;
                    prefs.putString("apiUrl", apiBaseUrl);
                    Serial.println("API Base URL salvo: " + apiBaseUrl);
                    start = millis();
                }
            }
            else if (line.startsWith("SET CATIVEIRO ") || line.startsWith("set cativeiro "))
            {
                String val = line.substring(14);
                val.trim();
                if (val.length() >= 24)
                {
                    cativeiroId = val;
                    prefs.putString("cativId", cativeiroId);
                    Serial.println("cativeiroId salvo: " + cativeiroId);
                    start = millis();
                }
                else
                {
                    Serial.println("ObjectId inválido (mínimo 24 chars).");
                }
            }
            else if (line.startsWith("SET DEVICEKEY ") || line.startsWith("set devicekey "))
            {
                String val = line.substring(14);
                val.trim();
                if (val.length() == 64)
                {
                    deviceKey = val;
                    prefs.putString("deviceKey", deviceKey);
                    Serial.println("Chave do dispositivo salva.");
                    start = millis();
                }
            }
            else if (line.startsWith("SET GPS ") || line.startsWith("set gps "))
            {
                float gps = line.substring(8).toFloat();
                if (gps > 0)
                {
                    gramas_por_segundo = gps;
                    Serial.printf("Motor: %.2f g/s\n", gramas_por_segundo);
                    start = millis();
                }
            }
        }

        if (millis() - ultimoTick >= 2000)
        {
            ultimoTick = millis();
            int restam = (int)((15000 - (millis() - start)) / 1500);
            if (restam >= 0)
                Serial.printf("(%ds para continuar...)\n", restam);
        }

        delay(50);
    }

    // ─── Validação ───────────────────────────────────────────
    if (savedSSID.isEmpty())
    {
        Serial.println("ERRO FATAL: SSID não configurado. Reinicie e configure.");
        while (true)
            delay(1000);
    }
    if (cativeiroId.isEmpty())
        Serial.println("AVISO: cativeiroId não configurado.");

    // ─── Conexão WiFi ────────────────────────────────────────
    Serial.printf("\nConectando em %s...\n", savedSSID.c_str());
    WiFi.begin(savedSSID.c_str(), savedPassword.c_str());

    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 20000)
    {
        delay(500);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED)
    {
        Serial.println("\nWiFi conectado! IP: " + WiFi.localIP().toString());
    }
    else
    {
        Serial.println("\nFalha no WiFi. Verifique SSID/senha e reinicie.");
        while (true)
        {
            Serial.print(".");
            delay(1000);
        }
    }

    // ─── NTP ─────────────────────────────────────────────────
    timeClient.begin();
    for (int i = 0; i < 10 && !ntpSincronizado; i++)
    {
        ntpSincronizado = timeClient.update();
        delay(500);
    }
    if (!ntpSincronizado)
        Serial.println("AVISO: NTP não sincronizou no boot.");

    // ─── Sensores ────────────────────────────────────────────
    sensors.begin();

    // ─── Busca dieta inicial ─────────────────────────────────
    buscarDietaDaAPI();
    ultimoFetch = millis();
}

// ─────────────────────────────────────────────────────────
void loop()
{
    // Gerencia desligamento do motor sem delay()
    verificarMotor();

    // Atualiza NTP periodicamente
    timeClient.update();

    unsigned long agora = millis();
    if (agora - ultimoFetch < intervaloFetch)
        return;
    ultimoFetch = agora;

    // ── Reconexão e sincronização ──
    reconectarWiFi();
    ntpSincronizado = timeClient.forceUpdate();
    if (!ntpSincronizado)
    {
        Serial.println("AVISO: NTP falhou. Dados de tempo podem estar errados.");
        return; // não age com tempo não confiável
    }

    int currentHour = timeClient.getHours();
    int currentMinute = timeClient.getMinutes();

    // Data correta usando epoch + offset já aplicado pelo NTPClient
    time_t epochTime = timeClient.getEpochTime();
    struct tm *ti = localtime(&epochTime);
    char dataAtual[11];
    sprintf(dataAtual, "%04d-%02d-%02d",
            1900 + ti->tm_year,
            1 + ti->tm_mon,
            ti->tm_mday);
    String dataHoje = String(dataAtual);
    String dataHoraISO = dataHoje + "T" + timeClient.getFormattedTime();

    // ── Leitura dos sensores ──
    float ph = lerPH();
    float amonia = lerAmonia();
    sensors.requestTemperatures();
    float temp = sensors.getTempCByIndex(0);

    if (temp == DEVICE_DISCONNECTED_C)
    {
        Serial.println("ERRO: sensor de temperatura desconectado!");
        return; // sensor desconectado: não envia leitura inválida
    }

    Serial.printf("[%s %02d:%02d] Temp: %.2f°C | pH experimental: %.2f | Amonia experimental: %.2f (unidade nao calibrada)\n",
                  dataHoje.c_str(), currentHour, currentMinute, temp, ph, amonia);

    // ── Envio para API ──
    enviarParametrosParaAPI(temp, ph, amonia, cativeiroId, dataHoraISO);

    // ── Alimentação ──
    buscarDietaDaAPI();

    bool horaCerta = (currentHour == horaAlvo && currentMinute == minutoAlvo);
    bool jáAlimentou = (ultimaDataAlimentacao == dataHoje);

    if (horaCerta && !jáAlimentou && !motorAtivo)
    {
        Serial.printf("Alimentando: %.2f g\n", racaoDesejada);
        ligarMotorPorTempo(racaoDesejada);
        ultimaDataAlimentacao = dataHoje;
    }
}
