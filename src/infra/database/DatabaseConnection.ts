export default interface DatabaseConnection {
	query (statement: string, params: any): Promise<any>;
	transaction<T> (work: (connection: DatabaseConnection) => Promise<T>): Promise<T>;
	close (): Promise<void>;
}
