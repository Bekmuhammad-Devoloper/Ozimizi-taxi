import { IsOptional, IsNumber, Max, Min } from 'class-validator';

export class CompleteOrderDto {
  // Upper bound prevents clients from inflating fare with absurd distances
  // (single intra-city ride should comfortably fit under 500 km).
  @IsNumber()
  @Min(0)
  @Max(500)
  distanceKm: number;

  // Part of distanceKm the phone counted outside the admin's zone.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  outsideKm?: number;
}
