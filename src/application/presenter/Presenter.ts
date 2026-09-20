export default interface Presenter<Input = any, Output = any> {
	present (output: Input): Output;
}
