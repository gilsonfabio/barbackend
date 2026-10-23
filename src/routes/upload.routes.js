
const express = require('express');
const multer = require('multer');

const routes = express.Router();
const UploadController = require('../controllers/UploadController');

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },

    fileFilter(request, file, callback) {
        const tiposPermitidos = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/avif',
        ];

        if (!tiposPermitidos.includes(file.mimetype)) {
            return callback(
                new Error(
                    'Formato inválido. Use JPG, PNG, WebP ou AVIF.'
                )
            );
        }

        return callback(null, true);
    },
});

routes.post(
    '/imagem',
    (request, response, next) => {
        upload.single('imagem')(
            request,
            response,
            (erro) => {
                if (!erro) {
                    return next();
                }

                if (erro.code === 'LIMIT_FILE_SIZE') {
                    return response.status(413).json({
                        status: false,
                        message: 'A imagem deve ter no máximo 5 MB.',
                    });
                }

                return response.status(400).json({
                    status: false,
                    message: erro.message ||
                        'Não foi possível processar o arquivo.',
                });
            }
        );
    },
    UploadController.imagem
);

module.exports = routes;
