import { IMAGE_MAX_SIZE_BYTES, IMAGE_TYPES } from '../config/images.js';
import * as cupcakeModel from '../models/cupcake.model.js';
import { AppError } from '../utils/AppError.js';
import { getCupcake } from './catalogAdmin.service.js';
import * as storageService from './storage.service.js';
import { storeToday } from './storeCalendar.service.js';

const OBJECT_NAME_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Passo 1: URL assinada para o upload direto ao Supabase Storage. */
export async function requestImageUpload(cupcakeId, { contentType }) {
  await getCupcake(cupcakeId);
  return {
    ...(await storageService.createCupcakeImageUpload(cupcakeId, contentType)),
    contentType,
    maxSizeBytes: IMAGE_MAX_SIZE_BYTES,
  };
}

/**
 * Passo 2: confirma o upload e vincula a imagem ao cupcake.
 * Verifica no Storage se o arquivo existe, o tipo e o tamanho; a imagem anterior é removida.
 */
export async function attachImage(cupcakeId, path) {
  const cupcake = await getCupcake(cupcakeId);

  const prefix = storageService.cupcakeImagePrefix(cupcakeId);
  if (!path.startsWith(prefix) || !OBJECT_NAME_PATTERN.test(path.slice(prefix.length))) {
    throw AppError.unprocessable(
      'Caminho de imagem inválido para este cupcake.',
      'INVALID_IMAGE_PATH',
    );
  }
  if (cupcake.imagePath === path) return cupcake;

  const info = await storageService.getObjectInfo(path);
  if (!info) {
    throw AppError.unprocessable(
      'A imagem ainda não foi enviada ao armazenamento.',
      'IMAGE_NOT_UPLOADED',
    );
  }

  const typeAllowed = Object.hasOwn(IMAGE_TYPES, info.contentType);
  if (!typeAllowed || info.size <= 0 || info.size > IMAGE_MAX_SIZE_BYTES) {
    await storageService.removeObjects([path]);
    throw AppError.unprocessable(
      'Imagem inválida: envie JPG, PNG ou WebP com até 5 MB.',
      'INVALID_IMAGE',
      { contentType: info.contentType, sizeBytes: info.size },
    );
  }

  const updated = await cupcakeModel.update(cupcakeId, { imagePath: path }, storeToday().date);
  await storageService.removeObjects([cupcake.imagePath]);
  return updated;
}

/** Remove a imagem do cupcake (registro e arquivo). */
export async function removeImage(cupcakeId) {
  const cupcake = await getCupcake(cupcakeId);
  if (!cupcake.imagePath) return cupcake;

  const updated = await cupcakeModel.update(cupcakeId, { imagePath: null }, storeToday().date);
  await storageService.removeObjects([cupcake.imagePath]);
  return updated;
}
