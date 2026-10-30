import { IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  // Coordinators created earlier may have 1–2 character usernames.
  @IsString()
  @MinLength(1)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
