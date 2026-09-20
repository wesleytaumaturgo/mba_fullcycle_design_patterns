import CsvPresenter from "./CsvPresenter";
import JsonPresenter from "./JsonPresenter";
import Presenter from "../../application/presenter/Presenter";
import PresenterFactory from "../../application/presenter/PresenterFactory";

export default class DynamicPresenterFactory implements PresenterFactory {

	create (format?: string): Presenter {
		if (format === undefined || format === "json") {
			return new JsonPresenter();
		}
		if (format === "csv") {
			return new CsvPresenter();
		}
		throw new Error("Invalid format");
	}
}
