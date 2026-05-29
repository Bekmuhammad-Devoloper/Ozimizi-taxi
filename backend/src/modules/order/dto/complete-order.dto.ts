import { IsNumber, Max, Min } from 'class-validator';

export class CompleteOrderDto {
  // Upper bound prevents clients from inflating fare with absurd distances
  // (single intra-city ride should comfortably fit under 500 km).
  @IsNumber()
  @Min(0)
  @Max(500)
  distanceKm: number;
}
