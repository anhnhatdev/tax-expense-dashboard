import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================================');
console.log('🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ TOÀN DIỆN TÍNH ĐÚNG ĐẮN CỦA DỮ LIỆU DASHBOARD THUẾ');
console.log('   Môi trường kiểm thử: Node.js Built-in Test Runner (Zero-Dependency)');
console.log('   Thời điểm thực thi:', new Date().toLocaleString('vi-VN'));
console.log('================================================================================\n');

const testFiles = [
  path.join(__dirname, '01_accounting_logic.test.js'),
  path.join(__dirname, '02_database_integrity.test.js'),
  path.join(__dirname, '03_api_endpoints.test.js')
];

const testStream = run({
  files: testFiles,
  concurrency: true,
  timeout: 30000
});

testStream
  .on('test:fail', (data) => {
    process.exitCode = 1;
  })
  .compose(new spec())
  .pipe(process.stdout);
