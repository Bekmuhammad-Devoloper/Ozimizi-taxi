import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class TariffTierDto {
  @IsNumber()
  @IsPositive()
  uptoKm: number;

  @IsNumber()
  @Min(0)
  price: number;
}

export class ZonePointDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

export class UpdateTariffDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumFare?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionPerOrder?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  waitingFreeMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waitingPricePerMinute?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TariffTierDto)
  tiers?: TariffTierDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ZonePointDto)
  zonePolygon?: ZonePointDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  outsidePricePerKm?: number;
}
