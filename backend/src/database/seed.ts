import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from './data-source';
import { Admin } from '../modules/admin/admin.entity';
import { Tariff } from '../modules/tariff/tariff.entity';
import {
  SETTING_KEYS,
  SiteSetting,
} from '../modules/settings/site-setting.entity';

const ADMIN_INITIAL_BALANCE = '100000000.00';

async function main() {
  await AppDataSource.initialize();

  const admins = AppDataSource.getRepository(Admin);
  let admin = await admins.findOne({ where: { username: 'admin' } });
  if (!admin) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    admin = await admins.save(
      admins.create({
        username: 'admin',
        passwordHash,
        role: 'admin',
        balance: ADMIN_INITIAL_BALANCE,
      }),
    );
    console.log('Seeded admin: admin / admin123 (treasury 100M)');
  } else {
    let touched = false;
    if (Number(admin.balance) === 0) {
      admin.balance = ADMIN_INITIAL_BALANCE;
      touched = true;
    }
    if (!admin.role) {
      admin.role = 'admin';
      touched = true;
    }
    if (touched) {
      await admins.save(admin);
      console.log('Patched existing admin (role/treasury)');
    } else {
      console.log('Admin already exists');
    }
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

  const settings = AppDataSource.getRepository(SiteSetting);
  for (const key of SETTING_KEYS) {
    const row = await settings.findOne({ where: { key } });
    if (!row) {
      await settings.save(settings.create({ key, value: '' }));
    }
  }
  console.log(`Ensured ${SETTING_KEYS.length} site-setting rows`);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
