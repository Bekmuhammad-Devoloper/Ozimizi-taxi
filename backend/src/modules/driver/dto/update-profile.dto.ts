import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  carModel?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  carColor?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  carPlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  carPhotoUrl?: string;
}
