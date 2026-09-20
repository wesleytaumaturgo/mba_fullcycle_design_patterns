export default interface Mediator {
	on (event: string, callback: Function): void;
	publish (event: string, data: any): Promise<void>;
}
