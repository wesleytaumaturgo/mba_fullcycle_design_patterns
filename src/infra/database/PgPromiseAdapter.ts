import DatabaseConnection from "./DatabaseConnection";
import pgp from "pg-promise";

export default class PgPromiseAdapter implements DatabaseConnection {
	connection: any;

	constructor () {
		this.connection = pgp()("postgres://postgres:123456@localhost:5432/app");
	}

	query(statement: string, params: any): Promise<any> {
		return this.connection.query(statement, params);
	}

	transaction<T>(work: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
		return this.connection.tx(function (transaction: any) {
			return work(new PgPromiseTransaction(transaction));
		});
	}

	close(): Promise<void> {
		return this.connection.$pool.end();
	}

}

class PgPromiseTransaction implements DatabaseConnection {

	constructor (readonly transactionContext: any) {
	}

	query(statement: string, params: any): Promise<any> {
		return this.transactionContext.query(statement, params);
	}

	transaction<T>(work: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
		return work(this);
	}

	close(): Promise<void> {
		return Promise.resolve();
	}

}
