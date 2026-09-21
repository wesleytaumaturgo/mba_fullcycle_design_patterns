import CloseInvoicing from "./application/usecase/CloseInvoicing";
import CloseInvoicingController from "./infra/http/CloseInvoicingController";
import ContractDatabaseRepository from "./infra/repository/ContractDatabaseRepository";
import ExpressAdapter from "./infra/http/ExpressAdapter";
import GenerateInvoices from "./application/usecase/GenerateInvoices";
import DynamicPresenterFactory from "./infra/presenter/DynamicPresenterFactory";
import LoggerDecorator from "./application/decorator/LoggerDecorator";
import MainController from "./infra/http/MainController";
import PgPromiseAdapter from "./infra/database/PgPromiseAdapter";
import InvoiceDatabaseRepository from "./infra/repository/InvoiceDatabaseRepository";
import Mediator from "./infra/mediator/Mediator";
import SendEmail from "./application/usecase/SendEmail";

const connection = new PgPromiseAdapter();
const contractRepository = new ContractDatabaseRepository(connection);
const mediator = new Mediator();
const sendEmail = new SendEmail();
mediator.on("InvoicesGenerated", async function (data: any) {
	await sendEmail.execute(data);
});
mediator.on("InvoicesClosed", async function (data: any) {
	await sendEmail.execute(data);
});
const presenterFactory = new DynamicPresenterFactory();
const invoiceRepository = new InvoiceDatabaseRepository(connection);
const generateInvoices = new LoggerDecorator(new GenerateInvoices(contractRepository, presenterFactory, mediator));
const closeInvoicing = new LoggerDecorator(new CloseInvoicing(contractRepository, invoiceRepository, presenterFactory, mediator));
const httpServer = new ExpressAdapter();
new MainController(httpServer, generateInvoices);
new CloseInvoicingController(httpServer, closeInvoicing);
httpServer.listen(3000);
