import { z } from 'zod';

// Mensagens de validação em português para todos os schemas da API.
z.config(z.locales.ptBR());

export { z };
