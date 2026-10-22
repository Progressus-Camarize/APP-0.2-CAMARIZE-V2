/**
 * Testes unitários para userService
 *
 * Todas as operações Mongoose são mockadas — nenhum banco de dados real é utilizado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────
const mockUserInstance = {
  _id: 'user-id-123',
  nome: 'João',
  email: 'joao@test.com',
  senha: '$2a$10$hashedPassword',
  role: 'membro',
  tokenVersion: 0,
  save: vi.fn(),
};

const mockEmailInstance = {
  save: vi.fn(),
};

vi.mock('../models/Users.js', () => {
  function MockUser() {
    return mockUserInstance;
  }
  MockUser.findOne = vi.fn();
  MockUser.findById = vi.fn();
  MockUser.findByIdAndUpdate = vi.fn();
  MockUser.findByIdAndDelete = vi.fn();
  MockUser.find = vi.fn();
  return { default: MockUser };
});

vi.mock('../models/EmailSettings.js', () => {
  function MockEmail() {
    return mockEmailInstance;
  }
  return { default: MockEmail };
});

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$10$hashedPassword'),
    compare: vi.fn(),
  },
}));

import User from '../models/Users.js';
import userService from '../services/userService.js';

// ════════════════════════════════════════════════════════════════════
describe('userService', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Create ──────────────────────────────────────────────────────
  describe('Create', () => {
    it('deve criar um novo usuário e retornar o documento salvo', async () => {
      mockUserInstance.save.mockResolvedValue(mockUserInstance);
      mockEmailInstance.save.mockResolvedValue({});

      const result = await userService.Create('João', 'joao@test.com', 'senhaForte123', null, null);

      expect(result).toEqual(mockUserInstance);
      expect(mockUserInstance.save).toHaveBeenCalled();
    });

    it('deve atribuir role padrão "membro" quando não especificado', async () => {
      mockUserInstance.save.mockResolvedValue(mockUserInstance);
      mockEmailInstance.save.mockResolvedValue({});

      const result = await userService.Create('João', 'joao@test.com', '123456', null, null);

      expect(result.role).toBe('membro');
    });
  });

  // ── getOne ──────────────────────────────────────────────────────
  describe('getOne', () => {
    it('deve buscar usuário por email', async () => {
      User.findOne.mockResolvedValue(mockUserInstance);

      const result = await userService.getOne('joao@test.com');

      expect(User.findOne).toHaveBeenCalledWith({ email: 'joao@test.com' });
      expect(result).toEqual(mockUserInstance);
    });

    it('deve retornar null quando usuário não existe', async () => {
      User.findOne.mockResolvedValue(null);

      const result = await userService.getOne('naoexiste@test.com');

      expect(result).toBeNull();
    });
  });

  // ── getById ─────────────────────────────────────────────────────
  describe('getById', () => {
    it('deve buscar usuário por ID', async () => {
      User.findById.mockResolvedValue(mockUserInstance);

      const result = await userService.getById('user-id-123');

      expect(User.findById).toHaveBeenCalledWith('user-id-123');
      expect(result).toEqual(mockUserInstance);
    });
  });

  // ── updateRole ──────────────────────────────────────────────────
  describe('updateRole', () => {
    it('deve atualizar o role do usuário e invalidar os tokens emitidos', async () => {
      const updated = { ...mockUserInstance, role: 'admin' };
      User.findByIdAndUpdate.mockResolvedValue(updated);

      const result = await userService.updateRole('user-id-123', 'admin');

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user-id-123', { role: 'admin', $inc: { tokenVersion: 1 } }, { new: true });
      expect(result.role).toBe('admin');
    });
  });

  // ── deleteUser ──────────────────────────────────────────────────
  describe('deleteUser', () => {
    it('deve deletar o usuário por ID', async () => {
      User.findByIdAndDelete.mockResolvedValue(mockUserInstance);

      const result = await userService.deleteUser('user-id-123');

      expect(User.findByIdAndDelete).toHaveBeenCalledWith('user-id-123');
      expect(result).toEqual(mockUserInstance);
    });
  });

  // ── incrementTokenVersion ───────────────────────────────────────
  describe('incrementTokenVersion', () => {
    it('deve incrementar tokenVersion via $inc', async () => {
      const updated = { ...mockUserInstance, tokenVersion: 1 };
      User.findByIdAndUpdate.mockResolvedValue(updated);

      const result = await userService.incrementTokenVersion('user-id-123');

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-id-123',
        { $inc: { tokenVersion: 1 } },
        { new: true }
      );
      expect(result.tokenVersion).toBe(1);
    });
  });
});
