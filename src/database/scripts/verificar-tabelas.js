
require('dotenv/config');

const db = require('../connection');

async function verificarTabelas() {
  try {
    const resultado = await db.raw('SHOW TABLES');

    console.log('Banco conectado:', process.env.DATABASE_NAME);
    console.log('Tabelas encontradas:');

    console.table(resultado[0]);
  } catch (erro) {
    console.error('Erro ao consultar as tabelas:', erro.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

verificarTabelas();
