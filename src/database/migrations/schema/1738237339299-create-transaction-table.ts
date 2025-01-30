import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateTransactionTable1738237339299 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "transaction",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "chatId",
            type: "varchar",
            isUnique: true,
          },
          {
            name: "userId",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "amount",
            type: "decimal",
            precision: 10,
            scale: 2,
          },
          {
            name: "location",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "fulltext",
            type: "text",
            isNullable: true,
          },
          {
            name: "date",
            type: "varchar",
          },
          {
            name: "time",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "category",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("transaction");
  }
}
