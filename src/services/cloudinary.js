
const cloudinary = require('cloudinary').v2;

const {
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
} = process.env;

function validarConfiguracaoCloudinary() {
    const ausentes = [];

    if (!CLOUDINARY_CLOUD_NAME) {
        ausentes.push('CLOUDINARY_CLOUD_NAME');
    }

    if (!CLOUDINARY_API_KEY) {
        ausentes.push('CLOUDINARY_API_KEY');
    }

    if (!CLOUDINARY_API_SECRET) {
        ausentes.push('CLOUDINARY_API_SECRET');
    }

    if (ausentes.length > 0) {
        throw new Error(
            `Configuração Cloudinary incompleta: ${ausentes.join(', ')}`
        );
    }
}

function configurarCloudinary() {
    validarConfiguracaoCloudinary();

    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true,
    });

    return cloudinary;
}

module.exports = {
    configurarCloudinary,
};
