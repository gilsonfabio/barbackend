
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('../database/connection');

function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function gerarSlug(nome) {
    const base = String(nome || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 150);

    return `${base || 'estabelecimento'}-${randomUUID().slice(0, 8)}`;
}

function gerarToken(usuario) {
    const segredo = process.env.JWT_SECRET;

    if (!segredo) {
        throw new Error('JWT_SECRET não está configurado.');
    }

    return jwt.sign(
        {
            perfil: usuario.perfil,
            estabelecimentoId: usuario.estabelecimento_id,
        },
        segredo,
        {
            subject: usuario.id,
            expiresIn: process.env.JWT_EXPIRES_IN || '8h',
        }
    );
}

function erroBancoDuplicado(erro) {
    return erro.code === 'ER_DUP_ENTRY' ||
        erro.errno === 1062;
}

module.exports = {
    async cadastrar(request, response) {
        try {
            const {
                estabelecimento,
                nome,
                email,
                senha,
                telefone,
                cnpj,
            } = request.body;

            const nomeEstabelecimento =
                String(estabelecimento || '').trim();

            const nomeUsuario = String(nome || '').trim();
            const emailNormalizado = normalizarEmail(email);

            if (
                !nomeEstabelecimento ||
                !nomeUsuario ||
                !emailNormalizado ||
                !senha
            ) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe o nome do estabelecimento, seu nome, ' +
                        'e-mail e senha.',
                });
            }

            if (
                nomeEstabelecimento.length > 150 ||
                nomeUsuario.length > 150
            ) {
                return response.status(400).json({
                    status: false,
                    message: 'Um dos nomes ultrapassa o limite permitido.',
                });
            }

            if (
                emailNormalizado.length > 180 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)
            ) {
                return response.status(400).json({
                    status: false,
                    message: 'Informe um e-mail válido.',
                });
            }

            if (
                typeof senha !== 'string' ||
                senha.length < 8 ||
                Buffer.byteLength(senha, 'utf8') > 72
            ) {
                return response.status(400).json({
                    status: false,
                    message:
                        'A senha deve ter pelo menos 8 caracteres ' +
                        'e no máximo 72 bytes.',
                });
            }

            const segredo = process.env.JWT_SECRET;

            if (!segredo) {
                console.error('JWT_SECRET não configurado.');

                return response.status(500).json({
                    status: false,
                    message: 'A autenticação não está configurada.',
                });
            }

            const senhaHash = await bcrypt.hash(senha, 12);

            const estabelecimentoId = randomUUID();
            const usuarioId = randomUUID();

            const dataAtual = new Date();

            await db.transaction(async (trx) => {
                await trx('mv_estabelecimentos').insert({
                    id: estabelecimentoId,
                    nome: nomeEstabelecimento,
                    slug: gerarSlug(nomeEstabelecimento),
                    telefone: telefone
                        ? String(telefone).trim().slice(0, 30)
                        : null,
                    cnpj: cnpj
                        ? String(cnpj).trim().slice(0, 20)
                        : null,
                    status: 'ATIVO',
                    created_at: dataAtual,
                    updated_at: dataAtual,
                });

                await trx('mv_usuarios').insert({
                    id: usuarioId,
                    estabelecimento_id: estabelecimentoId,
                    nome: nomeUsuario,
                    email: emailNormalizado,
                    senha: senhaHash,
                    perfil: 'PROPRIETARIO',
                    status: 'ATIVO',
                    created_at: dataAtual,
                    updated_at: dataAtual,
                });
            });

            const usuario = {
                id: usuarioId,
                nome: nomeUsuario,
                email: emailNormalizado,
                perfil: 'PROPRIETARIO',
                estabelecimento_id: estabelecimentoId,
            };

            const token = gerarToken(usuario);

            return response.status(201).json({
                status: true,
                message: 'Estabelecimento cadastrado com sucesso.',
                token,
                usuario: {
                    id: usuario.id,
                    nome: usuario.nome,
                    email: usuario.email,
                    perfil: usuario.perfil,
                    estabelecimentoId: estabelecimentoId,
                },
                estabelecimento: {
                    id: estabelecimentoId,
                    nome: nomeEstabelecimento,
                    slug: await db('mv_estabelecimentos')
                        .where({ id: estabelecimentoId })
                        .first()
                        .then((registro) => registro.slug),
                },
            });
        } catch (erro) {
            if (erroBancoDuplicado(erro)) {
                return response.status(409).json({
                    status: false,
                    message:
                        'Não foi possível concluir o cadastro devido ' +
                        'a um dado duplicado. Verifique se o e-mail ' +
                        'já está cadastrado.',
                });
            }

            console.error('Erro ao cadastrar:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao cadastrar o estabelecimento.',
            });
        }
    },

    async login(request, response) {
        try {
            const email = normalizarEmail(request.body.email);
            const senha = request.body.senha;

            if (
                !email ||
                typeof senha !== 'string' ||
                !senha
            ) {
                return response.status(400).json({
                    status: false,
                    message: 'Informe o e-mail e a senha.',
                });
            }

            if (!process.env.JWT_SECRET) {
                console.error('JWT_SECRET não configurado.');

                return response.status(500).json({
                    status: false,
                    message: 'A autenticação não está configurada.',
                });
            }

            const usuario = await db('mv_usuarios')
                .where({ email })
                .first();

            // Mensagem genérica para não revelar se o e-mail existe.
            if (!usuario || usuario.status !== 'ATIVO') {
                return response.status(401).json({
                    status: false,
                    message: 'E-mail ou senha inválidos.',
                });
            }

            const senhaValida = await bcrypt.compare(
                senha,
                usuario.senha
            );

            if (!senhaValida) {
                return response.status(401).json({
                    status: false,
                    message: 'E-mail ou senha inválidos.',
                });
            }

            if (usuario.estabelecimento_id) {
                const estabelecimento = await db('mv_estabelecimentos')
                    .where({ id: usuario.estabelecimento_id })
                    .first();

                if (!estabelecimento || estabelecimento.status !== 'ATIVO') {
                    return response.status(403).json({
                        status: false,
                        message: 'Estabelecimento indisponível.',
                    });
                }
            }

            await db('mv_usuarios')
                .where({ id: usuario.id })
                .update({
                    ultimo_acesso: new Date(),
                    updated_at: new Date(),
                });

            const token = gerarToken(usuario);

            return response.status(200).json({
                status: true,
                message: 'Login realizado com sucesso.',
                token,
                usuario: {
                    id: usuario.id,
                    nome: usuario.nome,
                    email: usuario.email,
                    perfil: usuario.perfil,
                    estabelecimentoId: usuario.estabelecimento_id,
                },
            });
        } catch (erro) {
            console.error('Erro no login:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao realizar login.',
            });
        }
    },
};
