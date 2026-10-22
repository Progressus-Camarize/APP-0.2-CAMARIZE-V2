import sensorService from "../services/sensorService.js";

const createSensor = async (req, res) => {
  try {
    const data = { ...req.body };
    
    // Adicionar o ID do usuário logado ao sensor
    data.user = req.loggedUser?.id;
    
    if (req.file) {
      data.foto_sensor = req.file.buffer;
    }
    
    const result = await sensorService.create(data);
    if (!result) {
      return res.status(500).json({ error: "Falha ao salvar no banco." });
    }
    res.status(201).json({ message: "Sensor criado com sucesso!" });
  } catch (error) {
    console.log("Erro no controller:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
};

const getAllSensores = async (req, res) => {
  try {
    // Buscar apenas sensores do usuário logado
    const usuarioId = req.loggedUser?.id;
    const sensores = await sensorService.getAllByUser(usuarioId);
    res.status(200).json(sensores);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Erro ao buscar sensores." });
  }
};

const getSensorById = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.loggedUser?.id;
    
    const sensor = await sensorService.getByIdAndUser(id, usuarioId);
    if (!sensor) {
      return res.status(404).json({ error: 'Sensor não encontrado.' });
    }
    res.status(200).json(sensor);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar sensor.' });
  }
};

const updateSensor = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.loggedUser?.id;
    const data = { ...req.body };
    delete data.user; // o dono do sensor não muda pela edição
    delete data._id;
    
    if (req.file) {
      data.foto_sensor = req.file.buffer;
    }

    const result = await sensorService.updateByUser(id, usuarioId, data);
    if (!result) {
      return res.status(404).json({ error: 'Sensor não encontrado.' });
    }
    res.status(200).json({ message: 'Sensor atualizado com sucesso!', sensor: result });
  } catch (error) {
    console.log("Erro no controller:", error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

const deleteSensor = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.loggedUser?.id;
    
    const result = await sensorService.deleteByUser(id, usuarioId);
    if (!result) {
      return res.status(404).json({ error: 'Sensor não encontrado.' });
    }
    res.status(200).json({ message: 'Sensor deletado com sucesso!' });
  } catch (error) {
    console.log("Erro no controller:", error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

export default { createSensor, getAllSensores, getSensorById, updateSensor, deleteSensor }; 