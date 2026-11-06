/**
 * Testes unitários para fazendaService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFazendaInstance = {
  _id: 'fazenda-id-1',
  nome: 'Fazenda Camarão Feliz',
  rua: 'Rua do Mar',
  bairro: 'Praia',
  cidade: 'Aracaju',
  numero: 100,
  codigo: 1,
  save: vi.fn(),
};

vi.mock('../models/Fazendas.js', () => {
  function MockFazenda() {
    return mockFazendaInstance;
  }
  MockFazenda.find = vi.fn();
  MockFazenda.findOne = vi.fn();
  MockFazenda.findById = vi.fn();
  MockFazenda.findByIdAndUpdate = vi.fn();
  MockFazenda.findByIdAndDelete = vi.fn();
  return { default: MockFazenda, SEM_FOTO_FAZENDA: '-foto_sitio' };
});

import Fazenda from '../models/Fazendas.js';
import fazendaService from '../services/fazendaService.js';

describe('fazendaService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getAll', () => {
    it('deve retornar todas as fazendas, sem a foto', async () => {
      const select = vi.fn().mockResolvedValue([mockFazendaInstance]);
      Fazenda.find.mockReturnValue({ select });

      const result = await fazendaService.getAll();

      expect(Fazenda.find).toHaveBeenCalled();
      expect(select).toHaveBeenCalledWith('-foto_sitio');
      expect(result).toHaveLength(1);
      expect(result[0].nome).toBe('Fazenda Camarão Feliz');
    });
  });

  describe('Create', () => {
    it('deve criar e salvar uma fazenda', async () => {
      mockFazendaInstance.save.mockResolvedValue(mockFazendaInstance);

      const result = await fazendaService.Create('Fazenda Teste', 'Rua A', 'Bairro B', 'Cidade C', 42);

      expect(mockFazendaInstance.save).toHaveBeenCalled();
      expect(result).toEqual(mockFazendaInstance);
    });

    it('deve retornar null em caso de erro ao salvar', async () => {
      mockFazendaInstance.save.mockRejectedValue(new Error('Erro de validação'));

      const result = await fazendaService.Create('', '', '', '', 0);

      expect(result).toBeNull();
    });
  });

  describe('getOne', () => {
    it('deve buscar fazenda por ID', async () => {
      Fazenda.findOne.mockResolvedValue(mockFazendaInstance);

      const result = await fazendaService.getOne('fazenda-id-1');

      expect(Fazenda.findOne).toHaveBeenCalledWith({ _id: 'fazenda-id-1' });
      expect(result).toEqual(mockFazendaInstance);
    });
  });

  describe('Delete', () => {
    it('deve deletar fazenda pelo ID', async () => {
      Fazenda.findByIdAndDelete.mockResolvedValue(mockFazendaInstance);

      await fazendaService.Delete('fazenda-id-1');

      expect(Fazenda.findByIdAndDelete).toHaveBeenCalledWith('fazenda-id-1');
    });
  });

  describe('updateFoto', () => {
    it('deve atualizar a foto da fazenda', async () => {
      const updated = { ...mockFazendaInstance, foto_sitio: 'base64string' };
      Fazenda.findByIdAndUpdate.mockResolvedValue(updated);

      const result = await fazendaService.updateFoto('fazenda-id-1', 'base64string');

      expect(Fazenda.findByIdAndUpdate).toHaveBeenCalledWith(
        'fazenda-id-1',
        { foto_sitio: 'base64string' },
        { new: true }
      );
      expect(result.foto_sitio).toBe('base64string');
    });
  });
});
