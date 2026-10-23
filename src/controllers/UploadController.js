
const sharp = require('sharp');
const { randomUUID } = require('crypto');

const {
    configurarCloudinary,
} = require('../services/cloudinary');

module.exports = {
    async imagem(request, response) {
        try {
            if (!request.file) {
                return response.status(400).json({
                    status: false,
                    message: 'Selecione uma imagem para enviar.',
                });
            }

            if (!request.estabelecimentoId) {
                return response.status(400).json({
                    status: false,
                    message: 'Estabelecimento não identificado.',
                });
            }

            const cloudinary = configurarCloudinary();

            // Redimensiona sem distorcer e converte para WebP.
            const imagemProcessada = await sharp(request.file.buffer)
                .rotate()
                .resize({
                    width: 1200,
                    height: 1200,
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .webp({
                    quality: 82,
                })
                .toBuffer();

            const pasta =
                `menuvivo/estabelecimentos/` +
                `${request.estabelecimentoId}/produtos`;

            const publicId = randomUUID();

            const resultado = await new Promise(
                (resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        {
                            folder: pasta,
                            public_id: publicId,
                            resource_type: 'image',
                            format: 'webp',
                        },
                        (erro, dados) => {
                            if (erro) {
                                return reject(erro);
                            }

                            return resolve(dados);
                        }
                    );

                    stream.end(imagemProcessada);
                }
            );

            return response.status(201).json({
                status: true,
                message: 'Imagem enviada com sucesso.',
                dados: {
                    url: resultado.secure_url,
                    public_id: resultado.public_id,
                    formato: resultado.format,
                    largura: resultado.width,
                    altura: resultado.height,
                    tamanho_bytes: resultado.bytes,
                },
            });
        } catch (erro) {
            console.error(
                'Erro ao enviar imagem para o Cloudinary:',
                erro.message
            );

            return response.status(500).json({
                status: false,
                message: 'Não foi possível enviar a imagem.',
            });
        }
    },
};
