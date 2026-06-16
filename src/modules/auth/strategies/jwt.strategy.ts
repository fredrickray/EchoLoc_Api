import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AppConfig } from '../../../config/configuration';
import { ERROR_CODES } from '../../../common/constants/api.constants';
import type { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<AppConfig, true>,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.accessSecret', { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException({
        message: 'Invalid access token',
        code: ERROR_CODES.AUTH_INVALID_TOKEN,
      });
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      handle: user.handle,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }
}
