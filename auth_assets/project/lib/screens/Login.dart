import 'package:flutter/material.dart';
class Login extends StatefulWidget {
	const Login({super.key});
	@override
	LoginState createState() => LoginState();
}
class LoginState extends State<Login> {
	@override
	Widget build(BuildContext context) {
		return Scaffold(
			body: SafeArea(
				child: Container(
					constraints: const BoxConstraints.expand(),
					color: Color(0xFFFFFFFF),
					child: Column(
						crossAxisAlignment: CrossAxisAlignment.start,
						children: [
							Expanded(
								child: IntrinsicHeight(
									child: Container(
										decoration: BoxDecoration(
											borderRadius: BorderRadius.circular(30),
											color: Color(0xFFFFFFFF),
										),
										width: double.infinity,
										height: double.infinity,
										child: SingleChildScrollView(
											child: Column(
												crossAxisAlignment: CrossAxisAlignment.start,
												children: [
													IntrinsicHeight(
														child: Container(
															padding: const EdgeInsets.only( top: 54),
															width: double.infinity,
															child: Column(
																children: [
																	Container(
																		margin: const EdgeInsets.only( bottom: 160),
																		child: Text(
																			"Login",
																			style: TextStyle(
																				color: Color(0xFF292929),
																				fontSize: 30,
																				fontWeight: FontWeight.bold,
																			),
																		),
																	),
																	IntrinsicHeight(
																		child: Container(
																			margin: const EdgeInsets.only( bottom: 329, left: 38, right: 38),
																			width: double.infinity,
																			child: Column(
																				children: [
																					IntrinsicHeight(
																						child: Container(
																							margin: const EdgeInsets.only( bottom: 14),
																							width: double.infinity,
																							child: Column(
																								crossAxisAlignment: CrossAxisAlignment.start,
																								children: [
																									IntrinsicHeight(
																										child: Container(
																											margin: const EdgeInsets.only( bottom: 18),
																											width: double.infinity,
																											child: Column(
																												crossAxisAlignment: CrossAxisAlignment.start,
																												children: [
																													Container(
																														margin: const EdgeInsets.only( bottom: 9),
																														child: Text(
																															"Enter your mobile number",
																															style: TextStyle(
																																color: Color(0xFF292929),
																																fontSize: 16,
																															),
																														),
																													),
																													IntrinsicHeight(
																														child: Container(
																															decoration: BoxDecoration(
																																border: Border.all(
																																	color: Color(0xFFD1D1D1),
																																	width: 1,
																																),
																																borderRadius: BorderRadius.circular(17),
																																color: Color(0xFFFCFCFC),
																															),
																															padding: const EdgeInsets.only( top: 19, bottom: 19, left: 30, right: 30),
																															width: double.infinity,
																															child: Row(
																																mainAxisAlignment: MainAxisAlignment.spaceBetween,
																																children: [
																																	IntrinsicWidth(
																																		child: IntrinsicHeight(
																																			child: Row(
																																				children: [
																																					IntrinsicWidth(
																																						child: IntrinsicHeight(
																																							child: Container(
																																								margin: const EdgeInsets.only( right: 10),
																																								child: Row(
																																									children: [
																																										Container(
																																											margin: const EdgeInsets.only( right: 16),
																																											child: Text(
																																												"+91",
																																												style: TextStyle(
																																													color: Color(0xFF292929),
																																													fontSize: 16,
																																												),
																																											),
																																										),
																																										Container(
																																											width: 11,
																																											height: 7,
																																											child: Image.network(
																																												"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/jMylANG2MC/zrcdsnft_expires_30_days.png",
																																												fit: BoxFit.fill,
																																											)
																																										),
																																									]
																																								),
																																							),
																																						),
																																					),
																																					Text(
																																						"1712345678",
																																						style: TextStyle(
																																							color: Color(0xFF696969),
																																							fontSize: 16,
																																						),
																																					),
																																				]
																																			),
																																		),
																																	),
																																	Container(
																																		width: 16,
																																		height: 16,
																																		child: Image.network(
																																			"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/jMylANG2MC/zmcadisn_expires_30_days.png",
																																			fit: BoxFit.fill,
																																		)
																																	),
																																]
																															),
																														),
																													),
																												]
																											),
																										),
																									),
																									IntrinsicHeight(
																										child: Container(
																											margin: const EdgeInsets.only( bottom: 8),
																											width: double.infinity,
																											child: Column(
																												crossAxisAlignment: CrossAxisAlignment.start,
																												children: [
																													Container(
																														margin: const EdgeInsets.only( bottom: 9),
																														child: Text(
																															"Enter your password",
																															style: TextStyle(
																																color: Color(0xFF292929),
																																fontSize: 16,
																															),
																														),
																													),
																													IntrinsicHeight(
																														child: Container(
																															decoration: BoxDecoration(
																																border: Border.all(
																																	color: Color(0xFFD1D1D1),
																																	width: 1,
																																),
																																borderRadius: BorderRadius.circular(17),
																																color: Color(0xFFFCFCFC),
																															),
																															padding: const EdgeInsets.only( top: 21, bottom: 21, left: 19, right: 19),
																															margin: const EdgeInsets.only( bottom: 9),
																															width: double.infinity,
																															child: Row(
																																mainAxisAlignment: MainAxisAlignment.spaceBetween,
																																children: [
																																	IntrinsicWidth(
																																		child: IntrinsicHeight(
																																			child: Container(
																																				padding: const EdgeInsets.only( bottom: 1),
																																				child: Column(
																																					crossAxisAlignment: CrossAxisAlignment.start,
																																					children: [
																																						Text(
																																							"**************",
																																							style: TextStyle(
																																								color: Color(0xFF696969),
																																								fontSize: 18,
																																							),
																																						),
																																					]
																																				),
																																			),
																																		),
																																	),
																																	Container(
																																		width: 19,
																																		height: 12,
																																		child: Image.network(
																																			"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/jMylANG2MC/6qmw8fsc_expires_30_days.png",
																																			fit: BoxFit.fill,
																																		)
																																	),
																																]
																															),
																														),
																													),
																													IntrinsicHeight(
																														child: Container(
																															width: double.infinity,
																															child: Column(
																																crossAxisAlignment: CrossAxisAlignment.end,
																																children: [
																																	Container(
																																		margin: const EdgeInsets.only( right: 2),
																																		child: Text(
																																			"forgot password?",
																																			style: TextStyle(
																																				color: Color(0xFF292929),
																																				fontSize: 16,
																																			),
																																		),
																																	),
																																]
																															),
																														),
																													),
																												]
																											),
																										),
																									),
																									InkWell(
																										onTap: () { print('Pressed'); },
																										child: IntrinsicHeight(
																											child: Container(
																												decoration: BoxDecoration(
																													borderRadius: BorderRadius.circular(17),
																													color: Color(0xFF151515),
																												),
																												padding: const EdgeInsets.symmetric(vertical: 19),
																												width: double.infinity,
																												child: Column(
																													children: [
																														Text(
																															"Login",
																															style: TextStyle(
																																color: Color(0xFFFFFFFF),
																																fontSize: 18,
																																fontWeight: FontWeight.bold,
																															),
																														),
																													]
																												),
																											),
																										),
																									),
																								]
																							),
																						),
																					),
																					IntrinsicWidth(
																						child: IntrinsicHeight(
																							child: Column(
																								crossAxisAlignment: CrossAxisAlignment.start,
																								children: [
																									Text(
																										"Don’t have an account? Sign Up",
																										style: TextStyle(
																											color: Color(0xFF696969),
																											fontSize: 16,
																										),
																									),
																								]
																							),
																						),
																					),
																				]
																			),
																		),
																	),
																	Container(
																		decoration: BoxDecoration(
																			borderRadius: BorderRadius.circular(3),
																			color: Color(0xFF000000),
																		),
																		margin: const EdgeInsets.only( bottom: 8),
																		width: 134,
																		height: 5,
																		child: SizedBox(),
																	),
																]
															),
														),
													),
												],
											)
										),
									),
								),
							),
						],
					),
				),
			),
		);
	}
}