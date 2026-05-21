import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from './data-source';
import { Admin } from '../modules/admin/admin.entity';
import { Tariff } from '../modules/tariff/tariff.entity';

async function main() {
  await AppDataSource.initialize();

  const admins = AppDataSource.getRepository(Admin);
  const exists = await admins.findOne({ where: { username: 'admin' } });
  if (!exists) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await admins.save(admins.create({ username: 'admin', passwordHash }));
    console.log('Seeded admin: admin / admin123');
  } else {
    console.log('Admin already exists');
  }

  const tariffs = AppDataSource.getRepository(Tariff);
  const t = await tariffs.find({ take: 1 });
  if (!t.length) {
    await tariffs.save(
      tariffs.create({
        pricePerKm: '2000.00',
        minimumFare: '10000.00',
        commissionPerOrder: '1000.00',
      }),
    );
    console.log('Seeded default tariff');
  }
  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
