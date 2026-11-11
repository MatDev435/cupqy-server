import { describe, expect, it } from 'vitest';
import { createAddressBody, updateAddressBody } from '../../../src/validators/address.validator.js';
import { updateProfileBody } from '../../../src/validators/user.validator.js';
import { idParams, paginationQuery } from '../../../src/validators/common.js';
import { z } from '../../../src/validators/zod.js';

const validAddress = {
  zipCode: '01310-100',
  street: '  Av.   Paulista ',
  number: '1000',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'sp',
};

describe('validators', () => {
  it('normaliza CEP, UF e espaços do endereço', () => {
    const result = createAddressBody.parse({ ...validAddress, complement: '   ' });

    expect(result).toMatchObject({
      zipCode: '01310100',
      street: 'Av. Paulista',
      state: 'SP',
      complement: null,
    });
  });

  it('rejeita CEP, UF e campos desconhecidos com mensagens em português', () => {
    const result = createAddressBody.safeParse({
      ...validAddress,
      zipCode: '123',
      state: 'XX',
      role: 'ADMIN',
    });

    const messages = Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join('.') || issue.code, issue.message]),
    );
    expect(messages.zipCode).toBe('CEP deve conter 8 dígitos.');
    expect(messages.state).toBe('UF inválida.');
    expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
  });

  it('exige ao menos um campo em atualizações parciais', () => {
    expect(updateAddressBody.safeParse({}).success).toBe(false);
    expect(updateProfileBody.safeParse({}).success).toBe(false);
    expect(updateAddressBody.safeParse({ number: '20' }).success).toBe(true);
  });

  it('valida nome e telefone do perfil', () => {
    expect(updateProfileBody.parse({ fullName: ' Ana  Souza ', phone: '(11) 98888-7777' })).toEqual(
      {
        fullName: 'Ana Souza',
        phone: '11988887777',
      },
    );
    expect(updateProfileBody.safeParse({ phone: '1234' }).success).toBe(false);
    expect(updateProfileBody.safeParse({ fullName: 'A' }).success).toBe(false);
    expect(updateProfileBody.parse({ phone: null })).toEqual({ phone: null });
  });

  it('valida identificadores UUID e paginação', () => {
    expect(idParams().safeParse({ id: 'abc' }).success).toBe(false);
    expect(idParams().safeParse({ id: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }).success).toBe(true);

    const pagination = z.object(paginationQuery);
    expect(pagination.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(pagination.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
