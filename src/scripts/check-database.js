require('dotenv/config');

const connection = require('../database/connection');

async function verificarBanco() {
  try {
    const resultado = await connection.raw(
      'SELECT DATABASE() AS banco, 1 AS conexao_ok'
    );

    console.log('Conexão estabelecida com sucesso.');
    console.log('Resultado:', resultado[0]);
  } catch (erro) {
    console.error('Falha ao conectar ao banco:', erro.message);
    process.exitCode = 1;
  } finally {
    await connection.destroy();
  }
}

verificarBanco();