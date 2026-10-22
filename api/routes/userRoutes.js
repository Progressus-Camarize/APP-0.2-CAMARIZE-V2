import express from "express";
const userRoutes = express.Router();
import userController from "../controllers/userController.js";
import { limitarLogin, limitarCadastro } from '../middleware/rateLimit.js';
import Auth from "../middleware/Auth.js";
import Cache from '../middleware/cache.js';

/**
 * @swagger
 * tags:
 *   name: Usuários
 *   description: Cadastro, autenticação e gerenciamento de usuários
 */

/**
 * @swagger
 * /users/user:
 *   post:
 *     summary: Criar usuário simples
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, senha]
 *             properties:
 *               nome:
 *                 type: string
 *                 example: João Silva
 *               email:
 *                 type: string
 *                 format: email
 *                 example: joao@email.com
 *               senha:
 *                 type: string
 *                 example: senha123
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Dados inválidos ou e-mail já cadastrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
userRoutes.post("/user", Auth.Authorization, Auth.RequireRole(['master']), userController.createUser);

/**
 * @swagger
 * /users/auth:
 *   post:
 *     summary: Login do usuário (retorna JWT)
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserLogin'
 *     responses:
 *       200:
 *         description: Login bem-sucedido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Credenciais inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
userRoutes.post("/auth", limitarLogin, userController.loginUser);

/**
 * @swagger
 * /users/register:
 *   post:
 *     summary: Registro completo (usuário + fazenda) — fluxo direto sem aprovação
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, senha]
 *             properties:
 *               nome:
 *                 type: string
 *                 example: João Silva
 *               email:
 *                 type: string
 *                 format: email
 *               senha:
 *                 type: string
 *               nomeFazenda:
 *                 type: string
 *                 example: Fazenda São João
 *               rua:
 *                 type: string
 *               bairro:
 *                 type: string
 *               cidade:
 *                 type: string
 *               numero:
 *                 type: number
 *     responses:
 *       201:
 *         description: Registro realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
userRoutes.post("/register", limitarCadastro, userController.register);

/**
 * @swagger
 * /users/register/proprietario:
 *   post:
 *     summary: Cadastro de proprietário — cria solicitação para aprovação pelo master
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, senha]
 *             properties:
 *               nome:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               senha:
 *                 type: string
 *               nomeFazenda:
 *                 type: string
 *               cidade:
 *                 type: string
 *     responses:
 *       201:
 *         description: Solicitação de cadastro enviada — aguarda aprovação
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
userRoutes.post("/register/proprietario", limitarCadastro, userController.registerProprietario);

/**
 * @swagger
 * /users/register/funcionario:
 *   post:
 *     summary: Cadastro de funcionário — cria solicitação para aprovação pelo admin da fazenda
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, senha, fazendaId]
 *             properties:
 *               nome:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               senha:
 *                 type: string
 *               fazendaId:
 *                 type: string
 *                 description: ID da fazenda onde o funcionário trabalhará
 *     responses:
 *       201:
 *         description: Solicitação de cadastro enviada — aguarda aprovação do admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
userRoutes.post("/register/funcionario", limitarCadastro, userController.registerFuncionario);

/**
 * @swagger
 * /users/check-email:
 *   post:
 *     summary: Verificar se um e-mail já está cadastrado
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Resultado da verificação
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exists:
 *                   type: boolean
 */
userRoutes.post("/check-email", Auth.Authorization, Auth.RequireRole(['master']), userController.checkEmailExists);

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Retorna dados do usuário autenticado
 *     tags: [Usuários]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do usuário logado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Não autorizado
 */
userRoutes.get("/me", Auth.Authorization, Cache.noStore, userController.getCurrentUser);

/**
 * @swagger
 * /users/logout:
 *   post:
 *     summary: Logout — invalida todos os tokens ativos do usuário
 *     tags: [Usuários]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Não autenticado
 */
userRoutes.post("/logout", Auth.Authorization, userController.logoutUser);

/**
 * @swagger
 * /users/masters/all:
 *   get:
 *     summary: Listar todos os masters — requer role admin ou master
 *     tags: [Usuários]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários master
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       403:
 *         description: Sem permissão
 */
userRoutes.get('/masters/all', Auth.Authorization, Auth.RequireRole(['admin','master']), Cache.cacheControl(120, 180), userController.listMasters);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Buscar usuário por ID
 *     tags: [Usuários]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do usuário (MongoDB ObjectId)
 *     responses:
 *       200:
 *         description: Dados do usuário
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: Usuário não encontrado
 */
userRoutes.get('/:id', Auth.Authorization, userController.getUserById);

/**
 * @swagger
 * /users/{id}/photo:
 *   patch:
 *     summary: Atualizar foto de perfil do usuário
 *     tags: [Usuários]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Foto atualizada com sucesso
 *       400:
 *         description: Nenhuma foto enviada
 */
userRoutes.patch('/:id/photo', Auth.Authorization, userController.updateUserPhoto);

/**
 * @swagger
 * /users/:
 *   get:
 *     summary: Listar usuários — requer role master. Filtro opcional por role via query param.
 *     tags: [Usuários]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [membro, admin, master]
 *         description: Filtrar usuários por role (ex. ?role=admin)
 *     responses:
 *       200:
 *         description: Lista de usuários (todos ou filtrados por role)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       403:
 *         description: Sem permissão (apenas master)
 */
userRoutes.get('/', Auth.Authorization, Auth.RequireRole(['master']), userController.listUsers);

/**
 * @swagger
 * /users/{id}/role:
 *   patch:
 *     summary: Alterar role de um usuário — requer role master
 *     tags: [Usuários]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [membro, admin, master]
 *     responses:
 *       200:
 *         description: Role atualizada com sucesso
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 */
userRoutes.patch('/:id/role', Auth.Authorization, Auth.RequireRole(['master']), userController.changeUserRole);

/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Atualizar dados do usuário (nome, email, senha) — requer role admin ou master
 *     tags: [Usuários]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do usuário (MongoDB ObjectId)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 example: João Silva
 *               email:
 *                 type: string
 *                 format: email
 *                 example: joao@email.com
 *               senha:
 *                 type: string
 *                 example: novaSenha123
 *     responses:
 *       200:
 *         description: Usuário atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Dados inválidos ou e-mail já em uso
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *   delete:
 *     summary: Remover usuário — requer role admin ou master
 *     tags: [Usuários]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do usuário (MongoDB ObjectId)
 *     responses:
 *       200:
 *         description: Usuário removido com sucesso
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 */
userRoutes.patch('/:id', Auth.Authorization, Auth.RequireRole(['admin', 'master']), userController.updateUser);
userRoutes.delete('/:id', Auth.Authorization, Auth.RequireRole(['admin', 'master']), userController.deleteUser);

/**
 * @swagger
 * /users/associar-funcionario:
 *   post:
 *     summary: Associar funcionário à fazenda — requer role admin
 *     tags: [Usuários]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [funcionarioId, fazendaId]
 *             properties:
 *               funcionarioId:
 *                 type: string
 *                 description: ID do usuário funcionário
 *               fazendaId:
 *                 type: string
 *                 description: ID da fazenda
 *     responses:
 *       200:
 *         description: Funcionário associado com sucesso
 *       403:
 *         description: Sem permissão
 */
userRoutes.post('/associar-funcionario', Auth.Authorization, Auth.RequireRole(['admin']), userController.associarFuncionario);

/**
 * @swagger
 * /users/funcionarios/fazenda:
 *   get:
 *     summary: Listar funcionários da fazenda do admin autenticado
 *     tags: [Usuários]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de funcionários
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       403:
 *         description: Sem permissão
 */
userRoutes.get('/funcionarios/fazenda', Auth.Authorization, Auth.RequireRole(['admin']), Cache.cacheControl(60, 120), userController.getFuncionariosDaFazenda);

/**
 * @swagger
 * /users/funcionarios/atualizar-status:
 *   post:
 *     summary: Ativar ou desativar funcionário na fazenda — requer role admin
 *     tags: [Usuários]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [usuarioId, ativo]
 *             properties:
 *               usuarioId:
 *                 type: string
 *               ativo:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Status atualizado
 *       403:
 *         description: Sem permissão
 */
userRoutes.post('/funcionarios/atualizar-status', Auth.Authorization, Auth.RequireRole(['admin']), userController.atualizarStatusFuncionario);

export default userRoutes;
