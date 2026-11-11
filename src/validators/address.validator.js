import { z } from './zod.js';
import { atLeastOneField, idParams, optionalText, requiredText, state, zipCode } from './common.js';

export const addressFields = {
  label: optionalText(40),
  zipCode: zipCode(),
  street: requiredText(150),
  number: requiredText(20),
  complement: optionalText(100),
  neighborhood: requiredText(100),
  city: requiredText(100),
  state: state(),
};

export const createAddressBody = z.strictObject({
  ...addressFields,
  isDefault: z.boolean().optional(),
});

export const updateAddressBody = atLeastOneField(
  z.strictObject({
    label: addressFields.label,
    zipCode: addressFields.zipCode.optional(),
    street: addressFields.street.optional(),
    number: addressFields.number.optional(),
    complement: addressFields.complement,
    neighborhood: addressFields.neighborhood.optional(),
    city: addressFields.city.optional(),
    state: addressFields.state.optional(),
    isDefault: z.literal(true).optional(),
  }),
);

export const addressParams = idParams('addressId');
