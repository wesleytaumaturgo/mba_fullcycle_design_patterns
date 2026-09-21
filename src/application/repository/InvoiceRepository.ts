export default interface InvoiceRepository {
	replacePeriod (month: number, year: number, type: string, invoices: InvoiceData[]): Promise<void>;
	listByPeriod (month: number, year: number, type: string): Promise<InvoiceData[]>;
}

export type InvoiceData = {
	idContract: string,
	date: Date,
	amount: number
}
