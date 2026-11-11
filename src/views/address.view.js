export function toAddressResponse(address) {
  return {
    id: address.id,
    label: address.label,
    zipCode: address.zipCode,
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    isDefault: address.isDefault,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}
