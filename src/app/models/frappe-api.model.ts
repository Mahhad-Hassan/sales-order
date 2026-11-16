export interface FrappeDataResponse<T> {
  data: T;
}

export interface FrappeListResponse<T> {
  data: T[];
}

export interface FrappeMessageResponse {
  message: string;
}

export interface FrappeMethodResponse<T> {
  message: T;
  _server_messages?: string | string[];
}

export interface FrappeLoginResponse {
  message: string;
  full_name?: string;
  home_page?: string;
}

export interface FrappeDocTypeField {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string | null;
  default?: string | null;
}

export interface FrappeDocTypeMetadata {
  name: string;
  fields: FrappeDocTypeField[];
  permissions?: Array<{
    role: string;
    write?: number;
    if_owner?: number;
    permlevel?: number;
  }>;
}