import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type Role = 'driver' | 'admin' | 'coordinator';

export interface JwtPayload {
  sub: string;
  role: Role;
  phone?: string;
  username?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
