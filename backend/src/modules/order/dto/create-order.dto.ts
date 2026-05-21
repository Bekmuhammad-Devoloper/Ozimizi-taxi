import { IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  clientId: string;

  @IsLatitude()
  pickupLat: number;

  @IsLongitude()
  pickupLng: number;

  @IsOptional()
  @IsString()
  pickupAddress?: string;
}
