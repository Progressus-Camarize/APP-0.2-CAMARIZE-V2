import mongoose from "mongoose";
import UsuariosxFazendas from "../models/UsuariosxFazendas.js";

// Vínculo ativo, ou legado sem o campo `ativo`
const VINCULO_ATIVO = { $or: [{ ativo: true }, { ativo: { $exists: false } }] };

// Checagens de acesso por fazenda reaproveitadas pelas rotas.
// `loggedUser` é o req.loggedUser do middleware Auth ({ id, role }).
class AccessService {
  async fazendaIdsDoUsuario(userId) {
    return await UsuariosxFazendas.find({ usuario: userId, ...VINCULO_ATIVO }).distinct('fazenda');
  }

  // Master acessa qualquer fazenda; os demais só as fazendas às quais estão vinculados
  async podeAcessarFazenda(loggedUser, fazendaId) {
    if (!mongoose.isValidObjectId(fazendaId)) return false;
    if (loggedUser.role === 'master') return true;
    const ids = await this.fazendaIdsDoUsuario(loggedUser.id);
    return ids.some(id => String(id) === String(fazendaId));
  }

  // Próprio usuário, master, ou alguém que divide uma fazenda com o alvo
  async podeAcessarUsuario(loggedUser, targetId) {
    if (!mongoose.isValidObjectId(targetId)) return false;
    if (loggedUser.role === 'master' || String(loggedUser.id) === String(targetId)) return true;
    const minhas = await this.fazendaIdsDoUsuario(loggedUser.id);
    if (minhas.length === 0) return false;
    return !!(await UsuariosxFazendas.exists({ usuario: targetId, fazenda: { $in: minhas }, ...VINCULO_ATIVO }));
  }
}

export default new AccessService();
