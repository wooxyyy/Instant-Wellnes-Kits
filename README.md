# Instant Wellness Kits Tax Calculator

Скрипт визначає юрисдикцію за координатами в NY, підбирає ставку з Pub718 та рахує:
- `composite_tax_rate`
- `tax_amount`
- `total_amount`
- `breakdown`
- `jurisdictions`

## Вимоги

- Node.js 18+ (рекомендовано)
- npm

## Встановлення

```bash
npm install
```

## Принцип запуску

Є 2 режими:

1. `interactive`  
   Вводите координати і subtotal вручну, отримуєте розрахунок одразу.
2. `csv`  
   Читає замовлення з CSV файлу (`data/input.csv` або ваш шлях).

## Усі команди запуску

### Через npm scripts

```bash
npm run start:interactive
npm run start:csv
```

### Напряму через ts-node

```bash
npx ts-node src/index.ts --interactive
npx ts-node src/index.ts --csv data/input.csv
```

### Перевірка TypeScript без збірки

```bash
npx tsc --noEmit
```

## Приклад інтерактивного сценарію

```text
Latitude: 40.834113404202824
Longitude: -73.8825612264399
Subtotal: 25
```

На виході повертається JSON з розрахунком податку і юрисдикціями.

## Формат CSV

Очікувані колонки:

```csv
id,longitude,latitude,timestamp,subtotal
```

