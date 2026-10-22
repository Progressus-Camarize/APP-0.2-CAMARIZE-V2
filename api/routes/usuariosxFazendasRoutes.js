import express from "express";
import mongoose from "mongoose";
const usuariosxFazendasRoutes = express.Router();
import UsuariosxFazendas from "../models/UsuariosxFazendas.js";
import Auth from "../middleware/Auth.js";

// Endpoint para listar relações usuario-fazenda (com filtro por usuario).
// Exige login: master consulta qualquer usuário; os demais só os próprios vínculos.
usuariosxFazendasRoutes.get("/", Auth.Authorization, async (req, res) => {
  try {
    const { usuario } = req.query;
    if (usuario !== undefined && (typeof usuario !== 'string' || !mongoose.isValidObjectId(usuario))) {
      return res.status(400).json({ error: "Parâmetro 'usuario' inválido." });
    }

    const filtro = {};
    if (req.loggedUser.role === 'master') {
      if (usuario) filtro.usuario = usuario;
    } else {
      if (usuario && usuario !== String(req.loggedUser.id)) {
        return res.status(403).json({ error: "Acesso negado aos vínculos de outro usuário." });
      }
      filtro.usuario = req.loggedUser.id;
    }

    const rels = await UsuariosxFazendas.find(filtro);
    res.json(rels);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar relações usuario-fazenda." });
  }
});

export default usuariosxFazendasRoutes;
