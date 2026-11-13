import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Rutas sin JWT (p. ej. POST /auth/login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
