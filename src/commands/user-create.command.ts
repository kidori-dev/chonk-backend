import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { UsersService } from '../modules/users/users.service';

interface UserCreateOptions {
  email: string;
  password: string;
  name?: string;
}

/**
 * 사용법: npm run cli -- user-create -e user@example.com -p password1234 [-n 이름]
 *
 * 로그인할 유저를 만든다. (회원가입 API 는 없다)
 */
@Command({
  name: 'user-create',
  description: '로그인 유저를 만든다. 예) user-create -e user@example.com -p password1234',
})
export class UserCreateCommand extends CommandRunner {
  private readonly logger = new Logger(UserCreateCommand.name);

  constructor(private readonly users: UsersService) {
    super();
  }

  async run(_params: string[], options: UserCreateOptions): Promise<void> {
    const user = await this.users.create(options);
    this.logger.log(`유저 생성 완료: ${user.email} (${user.id})`);
  }

  @Option({ flags: '-e, --email <email>', description: '이메일 (로그인 아이디)', required: true })
  parseEmail(value: string): string {
    return value;
  }

  @Option({
    flags: '-p, --password <password>',
    description: '비밀번호 (8자 이상)',
    required: true,
  })
  parsePassword(value: string): string {
    if (value.length < 8) {
      throw new Error('비밀번호는 8자 이상이어야 합니다.');
    }
    return value;
  }

  @Option({ flags: '-n, --name <name>', description: '이름' })
  parseName(value: string): string {
    return value;
  }
}
