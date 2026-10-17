# Avisos antecipados

O ESP32 envia leituras para `POST /parametros/cadastrar`. Para ativar avisos, um administrador ou master gera uma chave por viveiro em `POST /parametros/dispositivos/:cativeiroId/chave` com JWT. A resposta mostra a chave uma única vez; gerar outra revoga a anterior. Configure o dispositivo pelo serial com `SET DEVICEKEY <chave>` e use HTTPS na URL da API quando ela estiver fora da rede local. O firmware envia `X-Device-Key` e `amostraId` em cada leitura. Durante a migração, leituras sem chave continuam salvas com `origem=legado`, mas não entram na análise e não geram push. Chaves inválidas são rejeitadas.

Leituras com temperatura fora de −5 a 50 °C (inclusive −127 °C), pH fora de 0 a 14 e amônia negativa ou acima de 500 são rejeitadas. Registros antigos fora dessas faixas também são omitidos das consultas e gráficos. `amostraId` repetido de um dispositivo autenticado não cria leitura ou aviso novo. O histórico em `GET /parametros/historicos/:cativeiroId` usa `pagina` e `limite` (até 1.000); `proximaPagina` permite buscar todo o período.

São necessárias seis leituras autenticadas nos últimos 90 minutos, com intervalo máximo de 20 minutos entre elas e última leitura com até 15 minutos. A regra compara a média das três primeiras com a das três últimas e exige que as três últimas mantenham a direção da mudança. Temperatura abre aviso quando a média se move ao menos 0,3 °C e chega a 0,5 °C de um limite. Os limites podem ser definidos por administrador em `PATCH /parametros/limites-temperatura/:cativeiroId` com `{ "minimo": 26, "maximo": 30 }`; sem limites explícitos, a faixa inicial é a meta de temperatura do viveiro ±2 °C. Essa faixa é um ponto de partida operacional a revisar com os protótipos.

pH abre aviso com mudança de pelo menos 0,35 (padrão); amônia, com mudança de pelo menos 0,05 ou 25% da referência recente (padrão), o que for maior. Esses limiares podem ser calibrados por viveiro, igual já acontece com a temperatura: `PATCH /parametros/limites-sensibilidade/:cativeiroId` com `{ "phLimiar": 0.3, "amoniaLimiarPct": 0.2 }` (phLimiar entre 0,05 e 3; amoniaLimiarPct entre 0,05 e 1). Sem configuração explícita, usa os padrões do código. A banda de recuperação acompanha o limiar configurado (60% dele), para não ficar descasada se a sensibilidade mudar. Ambos são **experimentais**: o firmware ainda usa aproximações de sensor sem calibração nem unidade de amônia confirmada. O aplicativo não calcula NH₃ livre nem prescreve intervenção. A fração de amônia não ionizada varia, entre outros fatores, com pH e temperatura, segundo a [FAO](https://www.fao.org/4/AC210E/AC210E09.htm).

Cada ocorrência persiste até três leituras consecutivas voltarem à faixa (temperatura) ou perto da referência anterior (pH e amônia). Depois da recuperação, uma tendência nova pode abrir outra ocorrência. A API processa ao receber leituras e repete a verificação ao iniciar e em intervalos configurados. O histórico autenticado está em `GET /notifications/cativeiro/:cativeiroId`, isolado por fazenda. `PATCH /notifications/:id/avaliacao` aceita `confirmado` ou `falso_alarme` e registra o horário da primeira conferência.

Para avaliar a primeira versão, `GET /notifications/cativeiro/:cativeiroId/resumo` retorna ocorrências por parâmetro, falsos alarmes e o tempo médio até a conferência. Ajuste os limiares somente depois de comparar esses números com os dados de campo e confirmar a calibração dos sensores.

## Entrega de push: estados e retentativas

Push depende das chaves VAPID, de uma inscrição ativa no navegador e da API acordada na hospedagem. Cada aviso guarda seu próprio `pushStatus`:

- `pendente` — ainda não tentado, ou aguardando a próxima retentativa.
- `processando` — sendo entregue agora (evita duas tentativas simultâneas do mesmo aviso).
- `enviado` — entregue com sucesso a pelo menos uma inscrição ativa.
- `sem_inscricao` — ninguém com push ativo no momento; não é uma falha e não entra em retentativa (não haveria para quem reenviar).
- `falhou` — erro real de entrega (ex.: servidor de push indisponível) esgotou as 3 tentativas permitidas.

Uma falha real é reprocessada com backoff crescente (2, 10 e 30 minutos) antes de virar `falhou` definitivamente; sem as chaves VAPID configuradas, o aviso fica `pendente` esperando uma inicialização com configuração válida. O ciclo de monitoramento periódico reprocessa tanto avisos novos quanto retentativas vencidas — não é preciso reiniciar a API para uma retentativa acontecer.

## Contador de avisos não vistos (independe de push)

Como a entrega de push pode falhar, estar desabilitada ou o dispositivo pode estar offline no momento do envio, o app também expõe um contador que não depende disso: `GET /notifications/nao-vistos` retorna quantos avisos existem desde a última vez que o usuário abriu a tela de notificações, e `POST /notifications/marcar-visto` zera esse contador. O sino de notificações do app usa isso para mostrar um indicador mesmo que o push nunca tenha chegado.

## Aviso de sensor inativo

A detecção de tendência não cobre silêncio total: se o sensor para de enviar (sem energia, sem rede, cabo solto), não há leitura nova para avaliar tendência nenhuma. Por isso, cativeiros com um dispositivo provisionado (`POST /parametros/dispositivos/:cativeiroId/chave` já usado alguma vez) ganham uma checagem própria, rodada a cada ciclo do monitoramento periódico: sem nenhuma leitura autenticada há mais de 3 horas, abre um aviso `tipo: "sensor_inativo"`, que segue o mesmo ciclo de vida dos demais (push, contador de não vistos, recuperação automática quando uma leitura nova chega). Cativeiros que nunca tiveram uma chave gerada não são verificados — a ingestão manual/legada não tem expectativa de leituras contínuas.
