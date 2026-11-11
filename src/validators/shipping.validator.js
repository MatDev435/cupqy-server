import { z } from './zod.js';
import { uuid, zipCode } from './common.js';
import { addressFields } from './address.validator.js';

export const cepParams = z.object({ cep: zipCode() });

/** Endereço informado no checkout sem estar salvo no perfil. */
export const deliveryAddress = z.strictObject({
  zipCode: addressFields.zipCode,
  street: addressFields.street,
  number: addressFields.number,
  complement: addressFields.complement,
  neighborhood: addressFields.neighborhood,
  city: addressFields.city,
  state: addressFields.state,
});

export const pickupSelection = { fulfillmentType: z.literal('PICKUP') };

export const deliverySelection = {
  fulfillmentType: z.literal('DELIVERY'),
  addressId: uuid().optional(),
  address: deliveryAddress.optional(),
};

/** Para entrega, exatamente um entre endereço salvo (addressId) e endereço informado (address). */
export function exactlyOneAddress(data) {
  return data.fulfillmentType !== 'DELIVERY' || Boolean(data.addressId) !== Boolean(data.address);
}

export const ADDRESS_CHOICE_ERROR = {
  error: 'Para entrega, informe um endereço salvo (addressId) ou um novo endereço (address).',
  path: ['address'],
};

export const shippingQuoteBody = z
  .discriminatedUnion('fulfillmentType', [
    z.strictObject(pickupSelection),
    z.strictObject(deliverySelection),
  ])
  .refine(exactlyOneAddress, ADDRESS_CHOICE_ERROR);
