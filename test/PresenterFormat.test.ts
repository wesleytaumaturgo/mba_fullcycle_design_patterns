import CsvPresenter from "../src/infra/presenter/CsvPresenter";
import DynamicPresenterFactory from "../src/infra/presenter/DynamicPresenterFactory";
import JsonPresenter from "../src/infra/presenter/JsonPresenter";
import PresenterFactory from "../src/application/presenter/PresenterFactory";
// unit
let presenterFactory: PresenterFactory;

beforeEach(() => {
	presenterFactory = new DynamicPresenterFactory();
});

test("Deve devolver o JsonPresenter para format json", function () {
	const presenter = presenterFactory.create("json");
	expect(presenter).toBeInstanceOf(JsonPresenter);
	expect(presenter).not.toBeInstanceOf(CsvPresenter);
});

test("Deve devolver o JsonPresenter quando format está ausente", function () {
	const presenter = presenterFactory.create();
	expect(presenter).toBeInstanceOf(JsonPresenter);
	expect(presenter).not.toBeInstanceOf(CsvPresenter);
});

test("Deve devolver o CsvPresenter para format csv", function () {
	const presenter = presenterFactory.create("csv");
	expect(presenter).toBeInstanceOf(CsvPresenter);
	expect(presenter).not.toBeInstanceOf(JsonPresenter);
});

test("Deve lançar Invalid format para format desconhecido", function () {
	expect(() => presenterFactory.create("xml")).toThrow(new Error("Invalid format"));
});
