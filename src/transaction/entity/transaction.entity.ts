import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("transaction")
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  chatId: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: false })
  amount: number;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  fulltext: string;

  @Column({ nullable: false })
  date: string;

  @Column({ nullable: true })
  time: string;

  @Column({ nullable: true })
  category: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
