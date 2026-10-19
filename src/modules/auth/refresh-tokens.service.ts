import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, LessThan, Repository } from 'typeorm';

import { RefreshToken } from './entities/refresh-token.entity';

/**
 * 리프레시 토큰 발급/교체/폐기.
 *
 * - 토큰은 JWT 가 아닌 무작위 문자열이다. DB 에 있어야만 유효하다.
 * - 한 번 쓰면 폐기하고 새 토큰을 준다 (rotation).
 * - 이미 폐기된 토큰이 다시 들어오면 탈취로 보고 그 유저의 토큰을 전부 폐기한다.
 *   단, 로그아웃으로 폐기된 토큰은 예외로 거절만 한다.
 * - 만료된 토큰은 매일 새벽 4시에 지운다.
 */
@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);
  private readonly expiresInSeconds: number;

  constructor(
    @InjectRepository(RefreshToken)
    private readonly tokens: Repository<RefreshToken>,
    config: ConfigService,
  ) {
    this.expiresInSeconds = config.get<number>('jwt.refreshExpiresInSeconds')!;
  }

  /** 새 리프레시 토큰을 만들어 저장하고 원문을 돌려준다 */
  async issue(userId: string): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    await this.tokens.insert({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + this.expiresInSeconds * 1000),
    });
    return token;
  }

  /** 토큰을 검사하고 폐기한다. 정상이면 토큰 주인의 유저 id 를 돌려준다 */
  async consume(token: string): Promise<string> {
    const row = await this.tokens.findOneBy({ tokenHash: hashToken(token) });
    if (!row) {
      throw new UnauthorizedException('리프레시 토큰이 유효하지 않습니다.');
    }

    if (row.revokedAt) {
      // 로그아웃한 토큰은 클라이언트가 실수로 다시 보낼 수 있다. 탈취로 보지 않고 거절만 한다
      if (row.revokeReason !== 'logout') {
        this.logger.warn(`폐기된 리프레시 토큰 재사용 감지 → 유저 ${row.userId} 의 토큰 전부 폐기`);
        await this.revokeAll(row.userId);
      }
      throw new UnauthorizedException('리프레시 토큰이 유효하지 않습니다. 다시 로그인하세요.');
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('리프레시 토큰이 만료되었습니다. 다시 로그인하세요.');
    }

    // 동시에 같은 토큰으로 두 번 요청해도 한 번만 성공하도록, 아직 안 폐기된 경우에만 폐기한다
    const result = await this.tokens.update(
      { id: row.id, revokedAt: IsNull() },
      { revokedAt: new Date(), revokeReason: 'rotated' },
    );
    if (result.affected !== 1) {
      throw new UnauthorizedException('리프레시 토큰이 유효하지 않습니다.');
    }

    return row.userId;
  }

  /** 로그아웃. 없는 토큰이어도 조용히 넘어간다 */
  async revoke(token: string): Promise<void> {
    await this.tokens.update(
      { tokenHash: hashToken(token), revokedAt: IsNull() },
      { revokedAt: new Date(), revokeReason: 'logout' },
    );
  }

  /** 재사용(탈취) 감지 시 그 유저의 살아 있는 토큰을 전부 폐기한다 */
  private async revokeAll(userId: string): Promise<void> {
    await this.tokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokeReason: 'reuse_detected' },
    );
  }

  /**
   * 만료된 토큰을 지운다. 매일 새벽 4시(서버 시간)에 자동으로 돈다.
   *
   * 만료된 것만 지운다. 폐기됐지만 아직 만료 전인 토큰은 남겨둬야
   * 그 토큰이 다시 들어왔을 때 재사용(탈취)으로 감지할 수 있다.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async deleteExpired(): Promise<number> {
    const result = await this.tokens.delete({ expiresAt: LessThan(new Date()) });
    const deleted = result.affected ?? 0;
    this.logger.log(`만료된 리프레시 토큰 ${deleted}개 삭제`);
    return deleted;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
