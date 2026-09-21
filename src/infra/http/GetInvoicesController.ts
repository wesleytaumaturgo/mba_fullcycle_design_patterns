import HttpServer from "./HttpServer";
import Usecase from "../../application/usecase/Usecase";

export default class GetInvoicesController {

	constructor (readonly httpServer: HttpServer, readonly usecase: Usecase) {
		httpServer.on("get", "/invoices", async function (params: any, body: any, headers: any, query: any) {
			const input = { month: Number(query.month), year: Number(query.year), type: query.type, format: query.format };
			const output = await usecase.execute(input);
			return output;
		});
	}
}
