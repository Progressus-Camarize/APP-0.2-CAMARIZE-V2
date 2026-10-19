import swaggerJSDoc from 'swagger-jsdoc';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configuração central do Swagger / OpenAPI 3.0
 *
 * - `definition`: metadados globais, servidores e schemas reutilizáveis
 * - `apis`: caminhos dos arquivos de rotas onde estão os comentários @swagger
 */
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Camarize API',
      version: '1.0.0',
      description: `
API para monitoramento de aquicultura (carcinicultura).

Controla viveiros, sensores IoT (ESP32), parâmetros ambientais (temperatura, pH, amônia) e dispara alertas automáticos por e-mail e push notification quando as condições saem dos limites ideais.

## Autenticação
A maioria dos endpoints requer um token JWT. Para obtê-lo:
1. Faça \`POST /users/auth\` com email e senha
2. Copie o token retornado
3. Clique em **Authorize** (cadeado) e cole: \`Bearer {token}\`

## Papéis (Roles)
| Role | Permissões |
|------|-----------|
| \`membro\` | Apenas leitura; pode criar solicitações |
| \`admin\` | Gerencia recursos da própria fazenda |
| \`master\` | Acesso total ao sistema |
      `,
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Servidor de Desenvolvimento',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtido em POST /users/auth',
        },
      },
      schemas: {
        // ─── USUÁRIO ────────────────────────────────────────────────────────
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d0e' },
            nome: { type: 'string', example: 'João Silva' },
            email: { type: 'string', format: 'email', example: 'joao@email.com' },
            role: { type: 'string', enum: ['membro', 'admin', 'master'], example: 'admin' },
            fazenda: { type: 'string', description: 'ID da fazenda associada', example: '664a1b2c3d4e5f6a7b8c9d0f' },
            foto_perfil: { type: 'string', nullable: true },
            tokenVersion: { type: 'integer', default: 0, description: 'Versão do token JWT — incrementada ao invalidar sessões ativas', example: 0 },
          },
        },
        UserLogin: {
          type: 'object',
          required: ['email', 'senha'],
          properties: {
            email: { type: 'string', format: 'email', example: 'joao@email.com' },
            senha: { type: 'string', format: 'password', example: 'minhasenha123' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            user: { $ref: '#/components/schemas/User' },
          },
        },

        // ─── FAZENDA ────────────────────────────────────────────────────────
        Fazenda: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d0f' },
            codigo: { type: 'number', example: 1 },
            nome: { type: 'string', example: 'Fazenda São João' },
            rua: { type: 'string', example: 'Rua das Palmeiras' },
            bairro: { type: 'string', example: 'Centro' },
            cidade: { type: 'string', example: 'Mossoró' },
            numero: { type: 'number', example: 120 },
            foto_sitio: { type: 'string', nullable: true },
          },
        },
        FazendaCreate: {
          type: 'object',
          required: ['nome', 'rua', 'bairro', 'cidade', 'numero'],
          properties: {
            nome: { type: 'string', example: 'Fazenda São João' },
            rua: { type: 'string', example: 'Rua das Palmeiras' },
            bairro: { type: 'string', example: 'Centro' },
            cidade: { type: 'string', example: 'Mossoró' },
            numero: { type: 'number', example: 120 },
          },
        },

        // ─── CATIVEIRO (VIVEIRO) ─────────────────────────────────────────────
        Cativeiro: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d10' },
            id_cativeiro: { type: 'number', example: 1 },
            nome: { type: 'string', example: 'Viveiro A1' },
            id_tipo_camarao: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d11' },
            data_instalacao: { type: 'string', format: 'date', example: '2024-01-15' },
            foto_cativeiro: { type: 'string', format: 'binary', nullable: true, description: 'Imagem do cativeiro em binário' },
            temp_media_diaria: { type: 'string', nullable: true, example: '27.5' },
            ph_medio_diario: { type: 'string', nullable: true, example: '7.2' },
            amonia_media_diaria: { type: 'string', nullable: true, example: '0.1' },
            condicoes_ideais: { type: 'string', nullable: true },
            user: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d0e' },
          },
        },
        CativeiroCreate: {
          type: 'object',
          required: ['nome', 'id_tipo_camarao', 'data_instalacao'],
          properties: {
            nome: { type: 'string', example: 'Viveiro A1' },
            id_tipo_camarao: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d11' },
            data_instalacao: { type: 'string', format: 'date', example: '2024-01-15' },
          },
        },

        // ─── TIPO DE CAMARÃO ─────────────────────────────────────────────────
        TipoCamarao: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d11' },
            nome: { type: 'string', example: 'Litopenaeus vannamei (camarão branco)' },
          },
        },

        // ─── CONDIÇÕES IDEAIS ────────────────────────────────────────────────
        CondicoesIdeais: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            id_tipo_camarao: { type: 'string' },
            temp_ideal: { type: 'number', example: 28.0 },
            ph_ideal: { type: 'number', example: 7.5 },
            amonia_ideal: { type: 'number', example: 0.02 },
          },
        },

        // ─── SENSOR ─────────────────────────────────────────────────────────
        Sensor: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d12' },
            id_tipo_sensor: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d13' },
            apelido: { type: 'string', example: 'Sensor Viveiro A1' },
            foto_sensor: { type: 'string', format: 'binary', nullable: true, description: 'Imagem do sensor em binário' },
            user: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d0e' },
          },
        },
        SensorCreate: {
          type: 'object',
          required: ['id_tipo_sensor'],
          properties: {
            id_tipo_sensor: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d13' },
            apelido: { type: 'string', example: 'Sensor Viveiro A1' },
          },
        },

        // ─── SENSOR x CATIVEIRO ──────────────────────────────────────────────
        SensorCativeiro: {
          type: 'object',
          required: ['id_sensor', 'id_cativeiro'],
          properties: {
            _id: { type: 'string' },
            id_sensor: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d12' },
            id_cativeiro: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d10' },
          },
        },

        // ─── PARÂMETROS ──────────────────────────────────────────────────────
        // Leitura como persistida/retornada em consultas (campos _atual) — não é o
        // formato do corpo de POST /parametros/cadastrar, que usa nomes diferentes
        // (ver ParametroCreate).
        ParametroAtual: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            datahora: { type: 'string', format: 'date-time' },
            temp_atual: { type: 'number', example: 27.3 },
            ph_atual: { type: 'number', example: 7.1 },
            amonia_atual: { type: 'number', example: 0.05 },
            id_cativeiro: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d10' },
            origem: { type: 'string', enum: ['dispositivo', 'legado'], example: 'dispositivo' },
            autenticada: { type: 'boolean', example: true },
            amostraId: { type: 'string', nullable: true, example: 'esp32-01:1792300123' },
          },
        },
        // Corpo real aceito por POST /parametros/cadastrar.
        ParametroCreate: {
          type: 'object',
          required: ['id_cativeiro', 'temperatura', 'ph', 'amonia'],
          properties: {
            id_cativeiro: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d10' },
            temperatura: { type: 'number', example: 27.3, description: 'Entre -5 e 50' },
            ph: { type: 'number', example: 7.1, description: 'Entre 0 e 14' },
            amonia: { type: 'number', example: 0.05, description: 'Entre 0 e 500' },
            amostraId: {
              type: 'string',
              pattern: '^[A-Za-z0-9:_-]{1,80}$',
              example: 'esp32-01:1792300123',
              description: 'Opcional. Só tem efeito de idempotência em leituras autenticadas (com X-Device-Key); reenviar o mesmo amostraId não duplica a leitura.',
            },
          },
        },

        // ─── DIETA ───────────────────────────────────────────────────────────
        Dieta: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            descricao: { type: 'string', example: 'Ração Premium - Fase crescimento' },
            horaAlimentacao: { type: 'string', example: '08:00' },
            horarios: {
              type: 'array',
              items: { type: 'string' },
              example: ['08:00', '14:00', '20:00'],
            },
            quantidadeRefeicoes: { type: 'number', example: 3 },
            quantidade: { type: 'number', example: 2.5 },
          },
        },
        DietaCreate: {
          type: 'object',
          required: ['quantidade'],
          properties: {
            descricao: { type: 'string', example: 'Ração Premium - Fase crescimento' },
            horaAlimentacao: { type: 'string', example: '08:00' },
            horarios: {
              type: 'array',
              items: { type: 'string' },
              example: ['08:00', '14:00', '20:00'],
            },
            quantidadeRefeicoes: { type: 'number', minimum: 1, maximum: 6, example: 3 },
            quantidade: { type: 'number', example: 2.5 },
          },
        },

        // ─── SOLICITAÇÃO ─────────────────────────────────────────────────────
        Request: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            requesterUser: { type: 'string', nullable: true },
            requesterRole: { type: 'string', enum: ['membro', 'admin'] },
            targetRole: { type: 'string', enum: ['admin', 'master'] },
            type: { type: 'string', enum: ['leve', 'pesada'] },
            action: { type: 'string', example: 'cadastro_proprietario' },
            payload: { type: 'object' },
            status: { type: 'string', enum: ['pendente', 'aprovado', 'recusado'], example: 'pendente' },
            approverUser: { type: 'string', nullable: true },
            fazenda: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        RequestCreate: {
          type: 'object',
          required: ['requesterRole', 'targetRole', 'type', 'action', 'payload'],
          properties: {
            requesterRole: { type: 'string', enum: ['membro', 'admin'], example: 'membro' },
            targetRole: { type: 'string', enum: ['admin', 'master'], example: 'admin' },
            type: { type: 'string', enum: ['leve', 'pesada'], example: 'leve' },
            action: { type: 'string', example: 'cadastro_proprietario' },
            payload: { type: 'object', example: { nome: 'João', email: 'joao@email.com' } },
          },
        },

        // ─── EMAIL SETTINGS ──────────────────────────────────────────────────
        EmailSettings: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            userId: { type: 'string', description: 'ID do usuário dono das configurações' },
            emailEnabled: { type: 'boolean', example: true },
            emailAddress: { type: 'string', format: 'email', example: 'alertas@email.com' },
            alertTypes: {
              type: 'object',
              properties: {
                temperatura: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    severity: {
                      type: 'object',
                      properties: {
                        baixa: { type: 'boolean' },
                        media: { type: 'boolean' },
                        alta: { type: 'boolean' },
                      },
                    },
                  },
                },
                ph: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    severity: {
                      type: 'object',
                      properties: {
                        baixa: { type: 'boolean' },
                        media: { type: 'boolean' },
                        alta: { type: 'boolean' },
                      },
                    },
                  },
                },
                amonia: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    severity: {
                      type: 'object',
                      properties: {
                        baixa: { type: 'boolean' },
                        media: { type: 'boolean' },
                        alta: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
            quietHours: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean', example: false },
                startTime: { type: 'string', example: '22:00' },
                endTime: { type: 'string', example: '07:00' },
              },
            },
            frequency: {
              type: 'object',
              properties: {
                maxEmailsPerHour: { type: 'number', example: 5 },
                maxEmailsPerDay: { type: 'number', example: 20 },
                minIntervalMinutes: { type: 'number', example: 10, description: 'Intervalo mínimo entre e-mails (minutos)' },
              },
            },
            lastEmailSent: {
              type: 'object',
              nullable: true,
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
                count: { type: 'number', example: 2 },
              },
            },
            template: {
              type: 'object',
              properties: {
                language: { type: 'string', example: 'pt-BR' },
                includeCharts: { type: 'boolean', example: true },
                includeActions: { type: 'boolean', example: true },
              },
            },
            testEmailSent: { type: 'boolean', example: false },
            lastTestEmail: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        // ─── PUSH SUBSCRIPTION ───────────────────────────────────────────────
        PushSubscription: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            userId: { type: 'string', description: 'ID do usuário dono da subscription' },
            subscription: {
              type: 'object',
              properties: {
                endpoint: { type: 'string', example: 'https://fcm.googleapis.com/fcm/send/...' },
                keys: {
                  type: 'object',
                  properties: {
                    p256dh: { type: 'string' },
                    auth: { type: 'string' },
                  },
                },
              },
            },
            deviceInfo: {
              type: 'object',
              properties: {
                userAgent: { type: 'string' },
                platform: { type: 'string' },
              },
            },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        // ─── USUÁRIOS x FAZENDAS ─────────────────────────────────────────────
        UsuarioFazenda: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            usuario: { type: 'string', description: 'ID do usuário', example: '664a1b2c3d4e5f6a7b8c9d0e' },
            fazenda: { type: 'string', description: 'ID da fazenda', example: '664a1b2c3d4e5f6a7b8c9d0f' },
            ativo: { type: 'boolean', example: true, description: 'Indica se o vínculo está ativo' },
          },
        },

        // ─── DIETAS x CATIVEIROS ─────────────────────────────────────────────
        DietaCativeiro: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            cativeiro: { type: 'string', description: 'ID do cativeiro', example: '664a1b2c3d4e5f6a7b8c9d10' },
            dieta: { type: 'string', description: 'ID da dieta', example: '664a1b2c3d4e5f6a7b8c9d15' },
            inicioVigencia: { type: 'string', format: 'date-time', nullable: true },
            fimVigencia: { type: 'string', format: 'date-time', nullable: true },
            ativo: { type: 'boolean', example: true },
            criadoEm: { type: 'string', format: 'date-time' },
            atualizadoEm: { type: 'string', format: 'date-time' },
          },
        },


        // ─── CHAT ────────────────────────────────────────────────────────────
        Conversation: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            participants: {
              type: 'array',
              items: { type: 'string' },
              example: ['664a1b2c3d4e5f6a7b8c9d0e', '664a1b2c3d4e5f6a7b8c9d0f'],
            },
            lastMessageAt: { type: 'string', format: 'date-time' },
            unreadCounts: { type: 'object', example: { '664a1b2c3d4e5f6a7b8c9d0e': 2 } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Message: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            conversationId: { type: 'string' },
            senderId: { type: 'string' },
            text: { type: 'string', example: 'Temperatura do viveiro A1 está alta!' },
            readAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        // ─── AVISOS (alertas gerados pela pipeline de monitoramento) ─────────
        Aviso: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            tipo: { type: 'string', enum: ['temperatura', 'ph', 'amonia', 'sensor_inativo'] },
            cativeiro: { type: 'string', example: '664a1b2c3d4e5f6a7b8c9d10' },
            cativeiroNome: { type: 'string', example: 'Viveiro A1' },
            mensagem: { type: 'string' },
            datahora: { type: 'string', format: 'date-time', description: 'Quando o aviso foi criado' },
            estado: { type: 'string', enum: ['ativo', 'recuperado'] },
            periodoInicio: { type: 'string', format: 'date-time' },
            periodoFim: { type: 'string', format: 'date-time' },
            valorInicial: { type: 'number', nullable: true },
            valorAtual: { type: 'number', nullable: true },
            limite: { type: 'number', nullable: true },
            experimental: { type: 'boolean', description: 'pH/amônia (e todo aviso preditivo) são medições experimentais' },
            preditivo: { type: 'boolean', description: 'true = tendência projetada (Camada 1); false = limite já cruzado de fato' },
            recuperadoEm: { type: 'string', format: 'date-time', nullable: true },
            verificadoEm: { type: 'string', format: 'date-time', nullable: true },
            avaliacao: { type: 'string', enum: ['confirmado', 'falso_alarme'], nullable: true },
            frescor: {
              type: 'object',
              properties: {
                estado: { type: 'string', enum: ['sem_dados', 'recente', 'antigo'] },
                ultimaLeitura: { type: 'string', format: 'date-time', nullable: true },
                idadeMinutos: { type: 'integer', nullable: true },
                origem: { type: 'string', example: 'dispositivo' },
              },
            },
          },
        },

        // ─── CALIBRAÇÃO DE LIMIARES (Camada 2 da pipeline de avisos) ─────────
        SugestaoLimiar: {
          type: 'object',
          nullable: true,
          description: 'null quando não há amostra suficiente (mínimo 5 avisos avaliados) ou a taxa de falso alarme não justifica mudança.',
          properties: {
            campo: { type: 'string', enum: ['temperatura', 'ph', 'amonia'], example: 'ph' },
            amostras: { type: 'integer', example: 5 },
            taxaFalsoAlarme: { type: 'number', example: 0.8, description: 'Fração de avisos avaliados como falso_alarme' },
            motivo: { type: 'string', example: '4 de 5 avisos recentes foram marcados como falso alarme.' },
            valorAtual: {
              description: 'Número (pH/amônia) ou { minimo, maximo } (temperatura)',
              oneOf: [
                { type: 'number', example: 0.35 },
                { type: 'object', properties: { minimo: { type: 'number' }, maximo: { type: 'number' } } },
              ],
            },
            valorSugerido: {
              description: 'Mesmo formato de valorAtual, sempre mais frouxo (nunca sugere apertar)',
              oneOf: [
                { type: 'number', example: 0.42 },
                { type: 'object', properties: { minimo: { type: 'number' }, maximo: { type: 'number' } } },
              ],
            },
          },
        },

        // ─── RESPOSTAS GENÉRICAS ─────────────────────────────────────────────
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Mensagem de erro descritiva' },
          },
        },
        Success: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Operação realizada com sucesso' },
          },
        },
      },
    },
  },
  // Aponta para todos os arquivos de rotas onde estão os comentários @swagger
  apis: [join(__dirname, '../routes/*.js')],
};

const swaggerSpec = swaggerJSDoc(options);
export default swaggerSpec;
