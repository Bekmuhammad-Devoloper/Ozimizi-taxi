import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { Driver } from '../driver/driver.entity';
import { Admin } from '../admin/admin.entity';
import { Client } from '../client/client.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(Driver) private readonly drivers: Repository<Driver>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    private readonly ds: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'change-me'),
    });
  }

  /**
   * A token is only as good as the account behind it: a driver deleted or
   * blocked by the admin (or a removed coordinator) must be kicked out even
   * though their JWT is still formally valid. The 401 makes the apps log
   * out instead of sitting on stale data.
   */
  async validate(payload: JwtPayload) {
    if (payload.role === 'driver') {
      // findOne skips soft-deleted rows.
      const d = await this.drivers.findOne({
        where: { id: payload.sub },
        select: { id: true, isActive: true },
      });
      if (!d || !d.isActive) {
        throw new UnauthorizedException('Hisob o‘chirilgan yoki bloklangan');
      }
    } else if (payload.role === 'kitchen') {
      const [k] = (await this.ds.query(`SELECT is_active FROM kitchens WHERE id = $1`, [payload.sub])) as {
        is_active: boolean;
      }[];
      if (!k || !k.is_active) throw new UnauthorizedException('Oshxona faol emas');
    } else if (payload.role === 'client') {
      const c = await this.clients.findOne({
        where: { id: payload.sub },
        select: { id: true, isBlocked: true },
      });
      if (!c || c.isBlocked) {
        throw new UnauthorizedException('Hisob topilmadi yoki bloklangan');
      }
    } else {
      const a = await this.admins.findOne({
        where: { id: payload.sub },
        select: { id: true },
      });
      if (!a) throw new UnauthorizedException('Hisob topilmadi');
    }
    return payload;
  }
}
