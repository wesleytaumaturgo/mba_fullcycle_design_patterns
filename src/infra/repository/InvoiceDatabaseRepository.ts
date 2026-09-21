import DatabaseConnection from "../database/DatabaseConnection";
import InvoiceRepository, { InvoiceData } from "../../application/repository/InvoiceRepository";

export default class InvoiceDatabaseRepository implements InvoiceRepository {

	constructor (readonly connection: DatabaseConnection) {
	}

	async replacePeriod(month: number, year: number, type: string, invoices: InvoiceData[]): Promise<void> {
		await this.connection.transaction(async (transaction: DatabaseConnection) => {
			await transaction.query("delete from branas.invoice where month = $1 and year = $2 and type = $3", [month, year, type]);
			for (const invoice of invoices) {
				await transaction.query("insert into branas.invoice (id_contract, month, year, type, date, amount) values ($1, $2, $3, $4, $5, $6)", [invoice.idContract, month, year, type, invoice.date, invoice.amount]);
			}
		});
	}

}
