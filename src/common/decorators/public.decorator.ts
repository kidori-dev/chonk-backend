import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 로그인 없이 호출할 수 있는 API 에 붙인다. 안 붙이면 전부 JWT 가 필요하다 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
