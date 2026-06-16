import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import { ERROR_CODES } from '../../common/constants/api.constants';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import type { AppConfig } from '../../config/configuration';
import { UsersService } from '../users/users.service';

@Injectable()
export class RealtimeAuthService {
  private readonly logger = new Logger(RealtimeAuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly usersService: UsersService,
  ) {}

  async authenticateSocket(client: Socket): Promise<string | null> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      this.extractBearer(client.handshake.headers.authorization);

    if (!token) {
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
      });

      if (payload.type !== 'access') {
        return null;
      }

      const user = await this.usersService.findById(payload.sub);
      return user ? user.id : null;
    } catch (error) {
      this.logger.debug('WebSocket auth failed', error);
      return null;
    }
  }

  requireUserId(client: Socket): string {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      throw new UnauthorizedException({
        message: 'WebSocket authentication required',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }
    return userId;
  }

  private extractBearer(header?: string): string | undefined {
    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }
    return header.slice('Bearer '.length);
  }
}
