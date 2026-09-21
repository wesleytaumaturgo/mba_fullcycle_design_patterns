import CloseInvoicing from "../src/application/usecase/CloseInvoicing";
import Contract from "../src/domain/Contract";
import ContractDatabaseRepository from "../src/infra/repository/ContractDatabaseRepository";
import ContractRepository from "../src/application/repository/ContractRepository";
import DatabaseConnection from "../src/infra/database/DatabaseConnection";
import DynamicPresenterFactory from "../src/infra/presenter/DynamicPresenterFactory";
import GetInvoices from "../src/application/usecase/GetInvoices";
import InvoiceDatabaseRepository from "../src/infra/repository/InvoiceDatabaseRepository";
import Mediator from "../src/infra/mediator/Mediator";
import PgPromiseAdapter from "../src/infra/database/PgPromiseAdapter";
// integration
const SEED_CONTRACT_ID = "4224a279-c162-4283-86f5-1095f559b08c";
const UNKNOWN_CONTRACT_ID = "00000000-0000-0000-0000-000000000000";

let connection: DatabaseConnection;
let mediator: Mediator;
let closeInvoicing: CloseInvoicing;
let getInvoices: GetInvoices;

async function countInvoices (month: number, year: number, type: string) {
	const [row] = await connection.query("select count(*) as total from branas.invoice where month = $1 and year = $2 and type = $3", [month, year, type]);
	return parseInt(row.total);
}

async function clearPeriod (month: number, year: number, type: string) {
	await connection.query("delete from branas.invoice where month = $1 and year = $2 and type = $3", [month, year, type]);
}

beforeEach(() => {
	connection = new PgPromiseAdapter();
	mediator = new Mediator();
	closeInvoicing = new CloseInvoicing(
		new ContractDatabaseRepository(connection),
		new InvoiceDatabaseRepository(connection),
		new DynamicPresenterFactory(),
		mediator
	);
	getInvoices = new GetInvoices(new InvoiceDatabaseRepository(connection), new DynamicPresenterFactory());
});

afterEach(async () => {
	await connection.close();
});

test("Deve fechar o período e devolver o lote gerado", async function () {
	await clearPeriod(1, 2022, "accrual");
	const events: any[] = [];
	mediator.on("InvoicesClosed", async function (data: any) {
		events.push(data);
	});
	const output = await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	expect(output).toEqual([{ date: new Date("2022-01-01T13:00:00Z"), amount: 500 }]);
	const rows = await connection.query("select id_contract, amount, date from branas.invoice where month = 1 and year = 2022 and type = 'accrual'", []);
	expect(rows).toHaveLength(1);
	expect(rows[0].id_contract).toBe(SEED_CONTRACT_ID);
	expect(parseFloat(rows[0].amount)).toBe(500);
	expect(rows[0].date).toEqual(new Date("2022-01-01T13:00:00Z"));
	expect(events).toEqual([{ month: 1, year: 2022, type: "accrual", invoices: 1, total: 500 }]);
});

test("Deve substituir o fechamento anterior sem duplicar", async function () {
	await clearPeriod(1, 2022, "accrual");
	await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	expect(await countInvoices(1, 2022, "accrual")).toBe(1);
	await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	expect(await countInvoices(1, 2022, "accrual")).toBe(1);
});

test("Deve desfazer tudo quando a persistência falha no meio do lote", async function () {
	await clearPeriod(1, 2022, "accrual");
	await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	const [previous] = await connection.query("select id_invoice from branas.invoice where month = 1 and year = 2022 and type = 'accrual'", []);
	// o primeiro contrato é válido (o insert entra); o segundo aponta para um contrato inexistente e viola a chave estrangeira
	const contractRepository: ContractRepository = {
		async list (): Promise<Contract[]> {
			return [
				new Contract(SEED_CONTRACT_ID, "", 12000, 12, new Date("2022-01-01T10:00:00")),
				new Contract(UNKNOWN_CONTRACT_ID, "", 12000, 12, new Date("2022-01-01T10:00:00"))
			];
		}
	};
	const failingCloseInvoicing = new CloseInvoicing(
		contractRepository,
		new InvoiceDatabaseRepository(connection),
		new DynamicPresenterFactory(),
		mediator
	);
	await expect(failingCloseInvoicing.execute({ month: 1, year: 2022, type: "accrual" })).rejects.toThrow();
	const rows = await connection.query("select id_invoice, amount from branas.invoice where month = 1 and year = 2022 and type = 'accrual'", []);
	const newBatch = rows.filter((row: any) => parseFloat(row.amount) === 1000);
	expect(newBatch).toHaveLength(0);
	expect(rows).toHaveLength(1);
	expect(rows[0].id_invoice).toBe(previous.id_invoice);
	expect(parseFloat(rows[0].amount)).toBe(500);
});

test("Deve responder csv no fechamento", async function () {
	await clearPeriod(1, 2022, "cash");
	const output = await closeInvoicing.execute({ month: 1, year: 2022, type: "cash", format: "csv" });
	expect(output).toBe("2022-01-05;6000");
	expect(await countInvoices(1, 2022, "cash")).toBe(1);
});

test("Deve lançar Invalid format antes de qualquer efeito", async function () {
	await clearPeriod(1, 2022, "accrual");
	await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	const events: any[] = [];
	mediator.on("InvoicesClosed", async function (data: any) {
		events.push(data);
	});
	await expect(closeInvoicing.execute({ month: 1, year: 2022, type: "accrual", format: "xml" })).rejects.toThrow(new Error("Invalid format"));
	expect(await countInvoices(1, 2022, "accrual")).toBe(1);
	expect(events).toHaveLength(0);
});

test("Deve lançar Invalid type para regime desconhecido", async function () {
	await expect(closeInvoicing.execute({ month: 1, year: 2022, type: "unknown" })).rejects.toThrow(new Error("Invalid type"));
});

test("Deve remover as faturas antigas quando o período não gera faturas", async function () {
	await clearPeriod(3, 2023, "cash");
	await connection.query("insert into branas.invoice (id_contract, month, year, type, date, amount) values ($1, 3, 2023, 'cash', '2023-03-10T10:00:00', 100)", [SEED_CONTRACT_ID]);
	expect(await countInvoices(3, 2023, "cash")).toBe(1);
	const output = await closeInvoicing.execute({ month: 3, year: 2023, type: "cash" });
	expect(output).toEqual([]);
	expect(await countInvoices(3, 2023, "cash")).toBe(0);
});

test("Deve consultar em seguida as faturas do período fechado", async function () {
	await clearPeriod(1, 2022, "accrual");
	await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	const output = await getInvoices.execute({ month: 1, year: 2022, type: "accrual" });
	expect(output).toEqual([{ date: new Date("2022-01-01T13:00:00Z"), amount: 500 }]);
});

test("Deve devolver lista vazia para período sem faturas", async function () {
	await clearPeriod(4, 2023, "cash");
	const output = await getInvoices.execute({ month: 4, year: 2023, type: "cash" });
	expect(output).toEqual([]);
});

test("Deve ordenar as faturas consultadas por data", async function () {
	await clearPeriod(5, 2023, "accrual");
	// inseridas fora de ordem: a ordem de inserção não pode ser confundida com a ordem por data
	await connection.query("insert into branas.invoice (id_contract, month, year, type, date, amount) values ($1, 5, 2023, 'accrual', '2023-05-20T10:00:00', 200)", [SEED_CONTRACT_ID]);
	await connection.query("insert into branas.invoice (id_contract, month, year, type, date, amount) values ($1, 5, 2023, 'accrual', '2023-05-05T10:00:00', 100)", [SEED_CONTRACT_ID]);
	const output = await getInvoices.execute({ month: 5, year: 2023, type: "accrual" });
	expect(output).toEqual([
		{ date: new Date("2023-05-05T13:00:00Z"), amount: 100 },
		{ date: new Date("2023-05-20T13:00:00Z"), amount: 200 }
	]);
	await clearPeriod(5, 2023, "accrual");
});

test("Deve responder csv na consulta", async function () {
	await clearPeriod(1, 2022, "cash");
	await closeInvoicing.execute({ month: 1, year: 2022, type: "cash" });
	const output = await getInvoices.execute({ month: 1, year: 2022, type: "cash", format: "csv" });
	expect(output).toBe("2022-01-05;6000");
});
